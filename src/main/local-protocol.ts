// ============================================================================
// 本地文件协议 bbplayer-local://
//
// 下载下来的音频要能像在线流一样播放（拖进度条、循环、显示时长），
// 所以不能直接给 file:// URL：
//   1. file:// 在 Electron 生产环境（渲染页也是 file://）会被同源策略挡住；
//   2. <audio> 对 file:// 的 Range 请求支持很差，拖进度条会失效。
//
// 这里注册一个自定义协议，把 URL 里的 trackId 映射到本地文件路径，
// 并按 HTTP 语义处理 Range 请求（206 Partial Content）。
// ============================================================================
import { protocol } from 'electron'
import { createReadStream, statSync } from 'node:fs'
import { basename } from 'node:path'
import { Readable } from 'node:stream'
import { logWarn } from './logger'

export const LOCAL_SCHEME = 'bbplayer-local'

/** trackId → 本地绝对路径。由下载管理器在文件写完后登记 */
const fileRegistry = new Map<string, string>()

/** 登记已下载文件，返回给渲染层使用的 URL */
export function registerLocalFile(trackId: string, filePath: string): string {
  fileRegistry.set(trackId, filePath)
  return `${LOCAL_SCHEME}://track/${encodeURIComponent(trackId)}`
}

/** 注销（删除下载文件时调用） */
export function unregisterLocalFile(trackId: string): void {
  fileRegistry.delete(trackId)
}

/** 取本地文件路径 */
export function getLocalFilePath(trackId: string): string | undefined {
  return fileRegistry.get(trackId)
}

/**
 * 必须在 app ready 之前调用：把自定义协议标记为标准 scheme，
 * 这样 <audio> 才能像对待普通 URL 一样处理它。
 */
export function registerLocalScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: LOCAL_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: true,
      },
    },
  ])
}

/**
 * 注册协议处理器（app ready 之后调用）。
 * 按 HTTP 语义处理 Range，让进度条拖动可用。
 */
export function installLocalProtocolHandler(): void {
  protocol.handle(LOCAL_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      // bbplayer-local://track/<encoded trackId>
      const trackId = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      const filePath = fileRegistry.get(trackId)
      if (!filePath) {
        return new Response('not found', { status: 404 })
      }

      const stat = statSync(filePath)
      const total = stat.size
      const range = request.headers.get('range')

      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range)
        if (m) {
          const start = m[1] ? Number(m[1]) : 0
          const end = m[2] ? Number(m[2]) : total - 1
          if (start >= total || end < start) {
            return new Response(null, {
              status: 416,
              headers: { 'Content-Range': `bytes */${total}` },
            })
          }
          const chunkEnd = Math.min(end, total - 1)
          const stream = Readable.toWeb(
            createReadStream(filePath, { start, end: chunkEnd }),
          ) as ReadableStream
          return new Response(stream, {
            status: 206,
            headers: {
              'Content-Type': 'audio/mp4',
              'Accept-Ranges': 'bytes',
              'Content-Range': `bytes ${start}-${chunkEnd}/${total}`,
              'Content-Length': String(chunkEnd - start + 1),
            },
          })
        }
      }

      const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream
      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mp4',
          'Accept-Ranges': 'bytes',
          'Content-Length': String(total),
          'Content-Disposition': `inline; filename="${basename(filePath)}"`,
        },
      })
    } catch (e) {
      logWarn('local-protocol', '本地文件读取失败', {
        error: e instanceof Error ? e.message : String(e),
      })
      return new Response('error', { status: 500 })
    }
  })
}
