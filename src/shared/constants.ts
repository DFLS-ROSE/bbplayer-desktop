// ============================================================================
// BBPlayer Desktop —— 共享常量 / 默认值
// ============================================================================
import type { PlayMode, Settings, SessionContext, TrackSource } from './types'

export const APP_NAME = 'BBPlayer'

// 桌面 Chrome UA（主进程所有 HTTP 请求注入）
export const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

// B 站接口基址与风控头
export const BILI_API_BASE = 'https://api.bilibili.com'
export const BILI_PASSPORT_BASE = 'https://passport.bilibili.com'
export const BILI_REFERER = 'https://www.bilibili.com/'
export const BILI_ORIGIN = 'https://www.bilibili.com'

// —— 网络健壮性（超时 / 重试 / 限流）——
export const HTTP_TIMEOUT_MS = 15_000
export const HTTP_RETRY_MAX = 2
export const HTTP_RETRY_BASE_DELAY_MS = 500
export const HTTP_RETRY_MAX_DELAY_MS = 4_000
export const BILI_CONCURRENCY = 4
export const BILI_MIN_INTERVAL_MS = 150

// —— 登录态探活 ——
export const AUTH_PROBE_INTERVAL_MS = 5 * 60_000

// 播放模式（顺序 / 单曲 / 列表 / 随机）
export const PLAY_MODES: { value: PlayMode; label: string }[] = [
  { value: 'sequence', label: '顺序播放' },
  { value: 'loop-one', label: '单曲循环' },
  { value: 'loop-all', label: '列表循环' },
  { value: 'shuffle', label: '随机播放' },
]

export const DEFAULT_SETTINGS: Settings = {
  themeId: 'bili-pink',
  accentColor: '#fb7299',
  autoPlayOnLaunch: false,
  language: 'zh-CN',
  privacyAccepted: false,
  enableTelemetry: false,
  volume: 0.8,
  audioQuality: 'auto',
  lyricOverlay: {
    alwaysOnTop: true,
    opacity: 1,
    fontSize: 18,
    showRoman: false,
    showTranslation: false,
    mode: 'taskbar',
    lines: 1,
  },
  hotkeys: {},
}

export const DEFAULT_SESSION: SessionContext = {
  lastQueue: [],
  lastQueueIndex: -1,
  lastPosition: 0,
  lastMode: 'sequence',
  savedAt: 0,
}

export const SOURCE_LABELS: Record<TrackSource, string> = {
  local: '本地',
  favorite: '收藏夹',
  subscription: '订阅合集',
  imported: '导入',
  search: '搜索',
}
