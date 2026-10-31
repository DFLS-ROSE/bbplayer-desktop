// ============================================================================
// BBPlayer Desktop —— 安全策略唯一来源（CSP + 外链协议校验）
// 主进程 / 渲染进程共享，禁止散落字符串。
// ============================================================================

/**
 * 生产环境 CSP 策略（严格）：
 * - script-src 'self'：生产构建产物为外部 JS 文件，无内联脚本。
 * - style-src 保留 'unsafe-inline'：主题装扮通过 React style={{...}} 注入内联样式。
 * - connect-src 移除 http:/ws:/wss:：渲染进程在 prod 不直接 fetch（全走 IPC）。
 */
export const CSP_POLICY: string = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  // bbplayer-local: 用于播放下载到本地的音频（自定义协议，主进程提供文件流）
  "media-src 'self' https: blob: bbplayer-local:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "form-action 'none'",
].join('; ')

/**
 * 校验外部 URL 是否允许被 shell.openExternal 打开。
 * 仅允许 http: / https:，拒绝 file:/javascript:/data: 等危险协议。
 */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 把 B 站返回的协议相对（`//i0.hdslb.com/...`）或 http 资源 URL 统一补全为 https。
 * Electron 生产环境渲染页为 file:// 协议，`<img src="//...">` 会被解析成
 * file://i0.hdslb.com/... 而加载失败，必须显式补 https:。
 */
export function toHttps(url: string | null | undefined): string {
  if (!url) return ''
  if (url.startsWith('//')) return `https:${url}`
  if (url.startsWith('http://')) return `https://${url.slice('http://'.length)}`
  return url
}
