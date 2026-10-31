// ============================================================================
// BBPlayer Desktop —— 音频下载到本地
//
// 两件事：
// 1. 下载：拿播放地址 → 带风控头流式落盘 → 记进 downloads 表
// 2. 播放：把本地文件通过 bbplayer-local:// 协议喂给 <audio>
//
// 风控头是必须的：B 站 CDN 的 upos-* 节点缺 Referer/UA 会直接 403，
// 主进程自己发请求不经过渲染进程的 webRequest 钩子，必须手动补。
// ============================================================================
import { createWriteStream, mkdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { BILI_ORIGIN, BILI_REFERER, DEFAULT_UA } from '../shared/constants'
import { buildFileName } from '../shared/download-filename'
import { logError, logInfo, logWarn } from './logger'
import { registerLocalFile } from './local-protocol'
import type { DownloadRecord, DownloadTask } from '../shared/types'

/** 媒体请求的风控头（与渲染进程 security.ts 保持一致） */
const MEDIA_HEADERS: Record<string, string> = {
  Referer: BILI_REFERER,
  Origin: BILI_ORIGIN,
  'User-Agent': DEFAULT_UA,
}

/** 进度回调（主进程 → 渲染进程） */
export type ProgressListener = (task: DownloadTask) => void

/** 外部依赖：由主进程注入，避免这里直接依赖具体实现 */
export interface DownloadDeps {
  /** 取播放地址（含备用 CDN 节点） */
  resolveUrl: (bvid: string, cid: number) => Promise<{ audioUrl: string; backupUrls: string[]; quality: string }>
  /** 下载目录 */
  getDir: () => string
  /** 下载完成后写库 */
  saveRecord: (rec: DownloadRecord) => void
}

/**
 * 下载管理器：串行队列，避免同时开太多连接把 CDN 打到限流。
 * 每个任务独立 AbortController，支持取消。
 */
export class DownloadManager {
  private tasks = new Map<string, DownloadTask>()
  private controllers = new Map<string, AbortController>()
  private queue: string[] = []
  private running = false
  private listeners: ProgressListener[] = []
  /** 每个任务完成后的音质标签 */
  private qualities = new Map<string, string>()

  constructor(private readonly deps: DownloadDeps) {}

  onProgress(cb: ProgressListener): void {
    this.listeners.push(cb)
  }

  private emit(task: DownloadTask): void {
    for (const cb of this.listeners) {
      try {
        cb({ ...task })
      } catch {
        /* 单个监听器出错不影响其它 */
      }
    }
  }

  /** 当前所有任务的状态快照 */
  list(): DownloadTask[] {
    return [...this.tasks.values()].map((t) => ({ ...t }))
  }

  isDownloading(trackId: string): boolean {
    return this.tasks.get(trackId)?.status === 'downloading'
  }

  getDownloadDir(): string {
    return this.deps.getDir()
  }

  /** 加入下载队列（同一 trackId 重复调用会被忽略） */
  enqueue(params: {
    trackId: string
    bvid: string
    cid: number
    title: string
    artist: string
    coverUrl: string
    duration: number
  }): void {
    const existing = this.tasks.get(params.trackId)
    if (existing && existing.status === 'downloading') return
    const task: DownloadTask = {
      ...params,
      received: 0,
      total: 0,
      status: 'downloading',
    }
    this.tasks.set(params.trackId, task)
    this.queue.push(params.trackId)
    this.emit(task)
    void this.drain()
  }

  /** 取消排队中或下载中的任务 */
  cancel(trackId: string): void {
    const ctrl = this.controllers.get(trackId)
    if (ctrl) ctrl.abort()
    this.queue = this.queue.filter((id) => id !== trackId)
    const task = this.tasks.get(trackId)
    if (task && task.status === 'downloading') {
      task.status = 'error'
      task.error = '已取消'
      this.emit(task)
    }
  }

  /** 队列调度：一次只跑一个 */
  private async drain(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.queue.length > 0) {
        const trackId = this.queue.shift()
        if (!trackId) break
        const task = this.tasks.get(trackId)
        if (!task) continue
        await this.runOne(task)
      }
    } finally {
      this.running = false
    }
  }

  private async runOne(task: DownloadTask): Promise<void> {
    const controller = new AbortController()
    this.controllers.set(task.trackId, controller)
    try {
      // 1) 取播放地址
      const { audioUrl, backupUrls, quality } = await this.deps.resolveUrl(task.bvid, task.cid)
      this.qualities.set(task.trackId, quality)
      const candidates = [audioUrl, ...backupUrls].filter(Boolean)
      if (candidates.length === 0) throw new Error('未获取到可下载的音频地址')

      // 2) 逐个尝试候选节点（某个节点 403/503 时换下一个）
      let lastErr: unknown = null
      let done = false
      for (const url of candidates) {
        try {
          await this.fetchToFile(url, task, controller.signal)
          done = true
          break
        } catch (e) {
          if (controller.signal.aborted) throw e
          lastErr = e
          logWarn('download', '候选节点失败，尝试下一个', {
            trackId: task.trackId,
            host: safeHost(url),
            error: e instanceof Error ? e.message : String(e),
          })
        }
      }
      if (!done) throw lastErr instanceof Error ? lastErr : new Error('所有节点均下载失败')

      task.status = 'done'
      task.error = undefined
      logInfo('download', '下载完成', { trackId: task.trackId, size: task.received })
      this.emit(task)
    } catch (e) {
      const aborted = controller.signal.aborted
      task.status = 'error'
      task.error = aborted ? '已取消' : e instanceof Error ? e.message : String(e)
      logError('download', '下载失败', {
        trackId: task.trackId,
        error: task.error,
      })
      this.emit(task)
    } finally {
      this.controllers.delete(task.trackId)
    }
  }

  /** 流式下载到文件，边下边报进度 */
  private async fetchToFile(url: string, task: DownloadTask, signal: AbortSignal): Promise<void> {
    const dir = this.deps.getDir()
    mkdirSync(dir, { recursive: true })
    const filePath = join(dir, buildFileName(task.artist, task.title))

    const res = await fetch(url, { headers: MEDIA_HEADERS, signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    if (!res.body) throw new Error('响应没有内容')

    const total = Number(res.headers.get('content-length') ?? 0)
    task.total = total
    task.received = 0
    this.emit(task)

    // 进度统计：按块累计字节
    const source = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
    source.on('data', (chunk: Buffer | string) => {
      task.received += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length
      this.emit(task)
    })

    await pipeline(source, createWriteStream(filePath))
    task.received = statSync(filePath).size

    // 登记到本地协议，并写库
    registerLocalFile(task.trackId, filePath)
    this.deps.saveRecord({
      trackId: task.trackId,
      bvid: task.bvid,
      cid: task.cid,
      title: task.title,
      artist: task.artist,
      coverUrl: task.coverUrl,
      duration: task.duration,
      filePath,
      fileSize: task.received,
      quality: this.qualities.get(task.trackId) ?? '',
      downloadedAt: Date.now(),
    })
    this.emit(task)
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/** 删除已下载文件（不存在时静默成功） */
export function removeDownloadedFile(filePath: string): boolean {
  try {
    unlinkSync(filePath)
    return true
  } catch {
    return false
  }
}

// —— 单例（主进程初始化时注入依赖）——
let instance: DownloadManager | null = null

export function initDownloadManager(deps: DownloadDeps): DownloadManager {
  instance = new DownloadManager(deps)
  return instance
}

export function getDownloadManager(): DownloadManager {
  if (!instance) throw new Error('下载管理器尚未初始化')
  return instance
}
