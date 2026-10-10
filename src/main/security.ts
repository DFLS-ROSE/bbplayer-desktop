// ============================================================================
// BBPlayer Desktop —— 主进程安全加固：CSP 响应头注入 / 权限默认拒绝 / 窗口硬化
// ============================================================================
import { session, shell } from 'electron'
import type { BrowserWindow } from 'electron'
import { CSP_POLICY, isSafeExternalUrl } from '../shared/security'
import { logWarn } from './logger'

function isDev(): boolean {
  return !!process.env['ELECTRON_RENDERER_URL']
}

let installed = false

/**
 * 应用级安全加固（幂等）：
 * 1. 对 http/https 响应注入 CSP 响应头（生产环境；file:// 由 meta 兜底）。
 * 2. 默认拒绝全部权限请求（摄像头/麦克风/通知/定位/媒体/全屏等）。
 */
export function installSecurityHardening(): void {
  if (installed) return
  installed = true

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
