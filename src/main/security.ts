// ============================================================================
// BBPlayer Desktop —— 主进程安全加固：CSP 响应头注入 / 权限默认拒绝 / 窗口硬化
// ============================================================================
import { session, shell } from 'electron'
import type { BrowserWindow } from 'electron'
import { CSP_POLICY, isSafeExternalUrl } from '../shared/security'
import { BILI_ORIGIN, BILI_REFERER, DEFAULT_UA } from '../shared/constants'
import { logWarn } from './logger'

function isDev(): boolean {
  return !!process.env['ELECTRON_RENDERER_URL']
}

let installed = false

/** B 站音视频 CDN 主机（DASH 的 m4s / durl 的 mp4 都落在这里） */
const MEDIA_HOST_FILTER = {
  urls: ['*://*.bilivideo.com/*', '*://*.bilivideo.cn/*'],
}

/** 媒体请求必须携带的风控头：缺 Referer 或 UA 不是桌面浏览器时，部分节点直接回 403 */
const MEDIA_REQUEST_HEADERS: Record<string, string> = {
  Referer: BILI_REFERER,
  Origin: BILI_ORIGIN,
  'User-Agent': DEFAULT_UA,
}

const MEDIA_HEADER_KEYS = new Set(['referer', 'origin', 'user-agent'])

/**
 * 给渲染进程的媒体请求补齐 Referer / Origin / UA。
 *
 * 背景：`<audio>` 直连 B 站 CDN 时不带 Referer，且 Electron 默认 UA 含 `Electron/xx`，
 * upos-* 等节点会直接返回 403；Chromium 把 403 归为 MEDIA_ERR_SRC_NOT_SUPPORTED，
 * 表现为「MEDIA_ELEMENT_ERROR: Format error / 播放失败」，而易被误判成格式不支持。
 * 主进程的 HTTP 客户端已统一注入这几个头，这里补齐渲染进程这一路，保持口径一致。
 */
function installMediaHeaderHook(): void {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    MEDIA_HOST_FILTER,
    (details, callback) => {
      const requestHeaders = { ...details.requestHeaders }
      // 先按大小写无关清掉同名头，避免出现 referer / Referer 并存
      for (const key of Object.keys(requestHeaders)) {
        if (MEDIA_HEADER_KEYS.has(key.toLowerCase())) delete requestHeaders[key]
      }
      callback({ requestHeaders: { ...requestHeaders, ...MEDIA_REQUEST_HEADERS } })
    },
  )
}

/**
 * 应用级安全加固（幂等）：
 * 1. 对 http/https 响应注入 CSP 响应头（生产环境；file:// 由 meta 兜底）。
 * 2. 默认拒绝全部权限请求（摄像头/麦克风/通知/定位/媒体/全屏等）。
 * 3. 媒体请求补齐 B 站风控头（否则部分 CDN 节点 403 → 播放失败）。
 */
export function installSecurityHardening(): void {
  if (installed) return
  installed = true

  installMediaHeaderHook()

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders ?? {}
    const isHttp = details.url.startsWith('http://') || details.url.startsWith('https://')
    if (!isDev() && isHttp) {
      headers['Content-Security-Policy'] = [CSP_POLICY]
    }
    callback({ responseHeaders: headers })
  })

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    logWarn('security', '已拒绝权限请求', { permission })
    callback(false)
  })
}

/**
 * 单窗口硬化：统一注入到主窗口与歌词窗口。
 * - window.open / 外链：一律 deny，仅 http/https 经 shell.openExternal 安全外开。
 * - will-navigate / will-redirect：阻止跳离本地（dev 仅允许 dev server，prod 仅允许 file:）。
 */
export function hardenWindow(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url)
    } else {
      logWarn('security', '已拦截非安全协议外链', { url })
    }
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  const isAllowedNavigation = (url: string): boolean => {
    if (devUrl && url.startsWith(devUrl)) return true
    return url.startsWith('file://')
  }

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) {
      logWarn('security', '已阻止导航跳转', { url })
      event.preventDefault()
    }
  })

  win.webContents.on('will-redirect', (event, url) => {
    if (!isAllowedNavigation(url)) {
      logWarn('security', '已阻止重定向', { url })
      event.preventDefault()
    }
  })
}
