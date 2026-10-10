// electron-store：设置 / 会话上下文 / buvid3 / 加密 Cookie / 歌词窗口位置
import Store from 'electron-store'
import { safeStorage } from 'electron'
import { DEFAULT_SESSION, DEFAULT_SETTINGS } from '../../shared/constants'
import type { SessionContext, Settings, UserInfo } from '../../shared/types'

export type LyricBounds = {
  x?: number
  y?: number
  width?: number
  height?: number
}

type StoreSchema = {
  settings: Settings
  session: SessionContext
  buvid3: string
  buvid4: string
  sessionCookie: string | null // base64(safeStorage 加密) 或兜底 base64(明文)
  userInfo: UserInfo | null
  lyricBounds: LyricBounds
}

let instance: AppStore | null = null

export function getAppStore(): AppStore {
  if (!instance) instance = new AppStore()
  return instance
}

export class AppStore {
  private store: Store<StoreSchema>

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'settings',
      defaults: {
        settings: DEFAULT_SETTINGS,
        session: DEFAULT_SESSION,
        buvid3: '',
        buvid4: '',
        sessionCookie: null,
        userInfo: null,
        lyricBounds: {},
      },
    })
  }

  // —— 设置 ——
  getSettings(): Settings {
    return { ...DEFAULT_SETTINGS, ...this.store.get('settings') }
  }

  setSettings(patch: Partial<Settings>): Settings {
    const prev = this.getSettings()
    const next: Settings = {
      ...prev,
      ...patch,
      lyricOverlay: { ...prev.lyricOverlay, ...(patch.lyricOverlay ?? {}) },
    }
    this.store.set('settings', next)
    return next
  }

  // —— 会话 ——
  getSession(): SessionContext {
    return this.store.get('session') ?? DEFAULT_SESSION
  }

  setSession(ctx: SessionContext): void {
    this.store.set('session', ctx)
  }

  // —— buvid3 ——
  getBuvid3(): string {
    return this.store.get('buvid3') ?? ''
  }

  setBuvid3(v: string): void {
    this.store.set('buvid3', v)
  }

  // —— buvid4 ——
  getBuvid4(): string {
    return this.store.get('buvid4') ?? ''
  }

  setBuvid4(v: string): void {
    this.store.set('buvid4', v)
  }

  // —— 用户信息（非敏感）——
  getUserInfo(): UserInfo | null {
    return this.store.get('userInfo') ?? null
  }

  setUserInfo(u: UserInfo | null): void {
    this.store.set('userInfo', u)
  }

  // —— 登录 Cookie（敏感，safeStorage 加密，明文不落盘）——
  setSessionCookie(cookie: string): void {
    const plain = Buffer.from(cookie, 'utf8')
    if (safeStorage.isEncryptionAvailable()) {
      this.store.set('sessionCookie', safeStorage.encryptString(cookie).toString('base64'))
    } else {
      // 兜底：系统无密钥（如 Linux 无 keyring）时仅做 base64，属明确降级
      this.store.set('sessionCookie', plain.toString('base64'))
    }
  }

  getSessionCookie(): string | null {
    const raw = this.store.get('sessionCookie')
    if (!raw) return null
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(raw, 'base64'))
      }
      return Buffer.from(raw, 'base64').toString('utf8')
    } catch {
      return null
    }
  }

  clearSessionCookie(): void {
    this.store.set('sessionCookie', null)
  }

  /** 组装主进程所有 HTTP 请求携带的 Cookie 头 */
  buildCookie(): string {
    const parts: string[] = []
    const b3 = this.getBuvid3()
    const b4 = this.getBuvid4()
    if (b3) parts.push(`buvid3=${b3}`)
    if (b4) parts.push(`buvid4=${b4}`)
    const c = this.getSessionCookie()
    if (c) parts.push(c)
    return parts.join('; ')
  }

  // —— 歌词窗口位置 ——
  getLyricBounds(): LyricBounds {
    return this.store.get('lyricBounds') ?? {}
  }

  setLyricBounds(b: LyricBounds): void {
    this.store.set('lyricBounds', b)
  }
}
