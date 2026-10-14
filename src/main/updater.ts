// ============================================================================
// BBPlayer Desktop —— 内置更新（GitHub Releases）
// GitHub Releases 公开匿名可访问/下载，代码内无需内置令牌。
// 检查稳定版 / 列出所有版本（含测试版）/ 下载并覆盖安装
// ============================================================================
import { app, net } from 'electron'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { IPC } from '../shared/ipc'
import type { ReleaseInfo, StableUpdateResult, UpdateStatus } from '../shared/types'
import { createTraceId, logError, logInfo, logWarn } from './logger'
import { sendToMain } from './window-manager'

const GITHUB_OWNER = 'LuoPoTou666'
const GITHUB_REPO = 'bbplayer-desktop'
const GITHUB_API = 'https://api.github.com'
const UA = 'BBPlayer-Desktop'

interface GithubAsset {
  name: string
  browser_download_url: string
  size: number
}
interface GithubRelease {
  tag_name: string
  name: string
  prerelease: boolean
  published_at: string
  body?: string
  assets: GithubAsset[]
}

function push(status: UpdateStatus): void {
  sendToMain(IPC.AppUpdateStatus, status)
}

async function fetchReleases(): Promise<GithubRelease[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    // 用 Electron net.fetch（Chromium 网络栈，遵循系统代理），避免 Node 原生 fetch 直连被墙
    const res = await net.fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=100`, {
      headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`GitHub 接口 HTTP ${res.status}`)
    return (await res.json()) as GithubRelease[]
  } catch (e) {
    if (controller.signal.aborted) throw new Error('检查更新超时：无法访问 GitHub（请检查网络或代理）')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

function toReleaseInfo(r: GithubRelease): ReleaseInfo {
  const exe = r.assets.find((a) => a.name.toLowerCase().endsWith('.exe'))
  return {
    tag: r.tag_name,
    name: r.name || r.tag_name,
    prerelease: r.prerelease,
    publishedAt: r.published_at,
    body: r.body,
    size: exe?.size,
    url: exe?.browser_download_url,
  }
}

/** 版本比较（X.Y.Z 三段，忽略 v 前缀）：a > b 返回正数 */
function compareVersion(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const x = Number.isFinite(pa[i]) ? pa[i] : 0
    const y = Number.isFinite(pb[i]) ? pb[i] : 0
    if (x !== y) return x - y
  }
  return 0
}

/** 初始化（GitHub 更新为手动触发，无需常驻轮询） */
export function initUpdater(): void {
  logInfo('updater', '更新模块就绪（GitHub Releases）', { traceId: createTraceId() })
}

/** 检查稳定版更新：检索最新非 pre-release 版本，对比当前版本。当前版本始终返回（本地信息，不依赖网络）。 */
export async function checkStableUpdate(): Promise<StableUpdateResult> {
  const current = app.getVersion()
  try {
    const releases = await fetchReleases()
    const stable = releases.filter((r) => !r.prerelease)
    const latest = stable.length > 0 ? toReleaseInfo(stable[0]) : null
    const hasUpdate = latest ? compareVersion(latest.tag, current) > 0 : false
    return { hasUpdate, currentVersion: current, latest }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logWarn('updater', '检查更新失败', { traceId: createTraceId(), error: msg })
    return { hasUpdate: false, currentVersion: current, latest: null, error: msg }
  }
}

/** 列出所有版本（含测试版），按发布时间倒序（仅返回有 Windows 安装包的） */
export async function listVersions(): Promise<ReleaseInfo[]> {
  const releases = await fetchReleases()
  return releases.map(toReleaseInfo).filter((r) => r.url)
}

/** 下载指定版本并静默覆盖安装 */
export async function downloadAndInstall(tag: string): Promise<void> {
  const releases = await fetchReleases()
  const release = releases.find((r) => r.tag_name === tag)
  const exe = release?.assets.find((a) => a.name.toLowerCase().endsWith('.exe'))
  if (!exe) throw new Error(`版本 ${tag} 无 Windows 安装包`)

  const tmpPath = join(app.getPath('temp'), exe.name)
  logInfo('updater', '开始下载更新', { traceId: createTraceId(), tag, size: exe.size })
  push({ state: 'downloading', percent: 0 })

  const res = await net.fetch(exe.browser_download_url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  })
  if (!res.ok || !res.body) throw new Error(`下载失败 HTTP ${res.status}`)

  const total = Number(res.headers.get('content-length')) || exe.size || 0
  let loaded = 0
  const nodeStream = Readable.fromWeb(res.body as never)
  await pipeline(
    nodeStream,
    async function* (source) {
      for await (const chunk of source) {
        loaded += (chunk as Buffer).length
        if (total > 0) {
          push({ state: 'downloading', percent: Math.min(99, Math.round((loaded / total) * 100)) })
        }
        yield chunk
      }
    },
    createWriteStream(tmpPath),
  )

  logInfo('updater', '更新已下载，开始静默安装', { traceId: createTraceId(), tag, tmpPath })
  push({ state: 'downloaded', version: tag })

  // NSIS 静默覆盖安装（/S），detached 不阻塞退出；随后退出旧应用，安装器完成覆盖后自启动新应用
  try {
    const child = spawn(tmpPath, ['/S'], { detached: true, stdio: 'ignore' })
    child.unref()
    setTimeout(() => app.quit(), 800)
  } catch (e) {
    logError('updater', '启动安装程序失败', {
      traceId: createTraceId(),
      error: e instanceof Error ? e.message : String(e),
    })
    throw e
  }
}
