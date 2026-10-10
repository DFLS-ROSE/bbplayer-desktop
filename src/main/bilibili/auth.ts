// 登录态：扫码 / 短信（占位）/ Cookie，Cookie 经 safeStorage 加密落盘
import { IPC } from '../../shared/ipc'
import { AUTH_PROBE_INTERVAL_MS } from '../../shared/constants'
import { toHttps } from '../../shared/security'
import type { AuthState, QrCodeData, QrPollResult, UserInfo } from '../../shared/types'
import { createTraceId, logInfo, logWarn } from '../logger'
import type { AppStore } from '../store/app-store'
import { sendToMain } from '../window-manager'
import type { BiliApi } from './api'

function extractCookieValue(cookies: string[], name: string): string | null {
  for (const c of cookies) {
    const pair = c.split(';')[0].trim()
    const idx = pair.indexOf('=')
    if (idx === -1) continue
    if (pair.slice(0, idx).trim() === name) return pair.slice(idx + 1).trim()
  }
  return null
}

function normalizeCookie(raw: string): string {
  const parts = raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
  const keep = parts.filter((p) => /^(SESSDATA|bili_jct)=/.test(p))
  return keep.length > 0 ? keep.join('; ') : raw
}

export class AuthService {
  private probeTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly api: BiliApi,
    private readonly appStore: AppStore,
  ) {}

  getState(): AuthState {
    const user = this.appStore.getUserInfo()
    const hasCookie = !!this.appStore.getSessionCookie()
    return { isLoggedIn: hasCookie && !!user, user: hasCookie ? user : null }
  }

  async generateQr(): Promise<QrCodeData> {
    return this.api.getQrCode()
  }

  async pollQr(qrcodeKey: string): Promise<QrPollResult> {
    const { code, message, cookies } = await this.api.pollQrCodeRaw(qrcodeKey)
    if (code === 0) {
      const sessdata = extractCookieValue(cookies, 'SESSDATA')
      const biliJct = extractCookieValue(cookies, 'bili_jct')
      if (sessdata) {
        this.appStore.setSessionCookie(biliJct ? `SESSDATA=${sessdata}; bili_jct=${biliJct}` : `SESSDATA=${sessdata}`)
      }
      const user = await this.fetchUserInfo()
      this.emit()
      return { status: 'success', message: '登录成功', user }
    }
    switch (code) {
      case 86101:
        return { status: 'pending', message: message || '等待扫码' }
      case 86090:
        return { status: 'scanned', message: message || '已扫码，请在手机上确认' }
      case 86038:
        return { status: 'expired', message: message || '二维码已过期' }
      default:
        return { status: 'failed', message: message || `登录失败（${code}）` }
    }
  }

  async loginByCookie(rawCookie: string): Promise<UserInfo> {
    const trimmed = rawCookie.trim()
    if (!/SESSDATA=/.test(trimmed)) {
      throw new Error('Cookie 中未找到 SESSDATA，请检查后重试')
    }
    this.appStore.setSessionCookie(normalizeCookie(trimmed))
    const user = await this.fetchUserInfo()
    this.emit()
    return user
  }

  async loginBySms(_phone: string, _code: string): Promise<UserInfo> {
    // MVP：短信登录需 geetest 人机验证，暂不实现
    throw new Error('短信登录暂不支持：需通过人机验证（geetest），请使用扫码或 Cookie 登录')
  }

  async logout(): Promise<void> {
    this.appStore.clearSessionCookie()
    this.appStore.setUserInfo(null)
    this.emit()
  }

  async fetchUserInfo(): Promise<UserInfo> {
    const nav = await this.api.getNav()
    if (!nav.isLogin || !nav.mid) {
      this.appStore.clearSessionCookie()
      this.appStore.setUserInfo(null)
      throw new Error('Cookie 校验失败：未登录或已过期')
    }
    const user: UserInfo = { mid: nav.mid, name: nav.uname ?? '', face: toHttps(nav.face) }
    this.appStore.setUserInfo(user)
    return user
  }

  /**
   * 登录态探活：有 Cookie 则调 nav 校验。
   * - isLogin=false（明确鉴权失效）→ 清 Cookie + 清 userInfo + 推送 authChanged。
   * - 网络 / 超时等瞬时错误 → 保留 Cookie，待下一探活周期重试（避免误登出）。
   * @returns 仍有效返回 true；无 Cookie 或失效返回 false。
   */
  async verifySession(): Promise<boolean> {
    if (!this.appStore.getSessionCookie()) return false
    try {
      const nav = await this.api.getNav()
      if (!nav.isLogin || !nav.mid) {
        this.handleAuthFailure('Cookie 校验失败：未登录或已过期')
        return false
      }
      this.appStore.setUserInfo({ mid: nav.mid, name: nav.uname ?? '', face: toHttps(nav.face) })
      return true
    } catch (e) {
      logWarn('bili.auth', '登录态探活失败（瞬时错误，保留 Cookie）', {
        traceId: createTraceId(),
        error: e instanceof Error ? e.message : String(e),
      })
      return false
    }
  }

  /** 请求返回 BILI_-101 等鉴权失效码时由 HttpClient 回调：清 Cookie + 清 userInfo + 推送 */
  handleAuthFailure(reason: string): void {
    this.appStore.clearSessionCookie()
    this.appStore.setUserInfo(null)
    logInfo('bili.auth', reason, { traceId: createTraceId() })
    this.emit()
  }

  /** 定期探活（默认 5min，unref 不阻塞退出） */
  startProbe(intervalMs: number = AUTH_PROBE_INTERVAL_MS): void {
    if (this.probeTimer) return
    this.probeTimer = setInterval(() => {
      void this.verifySession()
    }, intervalMs)
    this.probeTimer.unref?.()
  }

  stopProbe(): void {
    if (this.probeTimer) {
      clearInterval(this.probeTimer)
      this.probeTimer = null
    }
  }

  private emit(): void {
    sendToMain(IPC.BiliAuthChanged, this.getState())
  }
}
