// ============================================================================
// BBPlayer Desktop —— 领域类型定义（主进程 / 渲染进程共享）
// ============================================================================

// —— 播放模式 ——
export type PlayMode = 'sequence' | 'loop-one' | 'loop-all' | 'shuffle'

// —— 播放项来源 ——
export type TrackSource = 'local' | 'favorite' | 'subscription' | 'imported' | 'search'

// —— 歌单类型 ——
export type PlaylistType = 'local' | 'favorite' | 'subscription' | 'imported'

// —— 播放项 ——
export interface Track {
  id: string // 全局唯一，= `${bvid}_${cid}` 或 uuid
  bvid: string
  cid: number
  aid?: number
  title: string
  artist: string // UP 主 / 歌手
  coverUrl: string
  duration: number // 秒
  audioUrl?: string // DASH 音频流地址（运行时填充，有签名时效）
  source: TrackSource
  playlistId?: string
}

// —— 歌单 ——
export interface Playlist {
  id: string
  name: string
  type: PlaylistType
  sourceId?: string // 收藏夹 media_id / 合集 series_id / 导入源标识
  trackCount: number
  createdAt: number
  updatedAt: number
}

// —— 播放历史 ——
export interface PlayHistoryEntry {
  trackId: string
  bvid: string
  cid: number
  title: string
  artist: string
  coverUrl: string
  playedAt: number
}

// —— 断点续播进度 ——
export interface PlaybackProgress {
  trackId: string
  position: number // 秒
  duration: number // 秒
  updatedAt: number
}

// —— 播放器状态（Zustand）——
export interface PlayerState {
  currentTrack: Track | null
  queue: Track[]
  queueIndex: number
  mode: PlayMode
  isPlaying: boolean
  position: number
  duration: number
  volume: number // 0..1
  loudness: boolean // 响度均衡开关
}

// —— 歌词悬浮窗设置 ——
export interface LyricOverlaySettings {
  alwaysOnTop: boolean
  opacity: number // 0.1..1
  fontSize: number // px
  showRoman: boolean
  showTranslation: boolean
  mode: 'float' | 'taskbar' // 屏幕悬浮窗 / 任务栏空白处
  lines: 1 | 2 // 任务栏模式：横向单行 / 双行
}

// —— 设置 ——
export interface Settings {
  themeId: string
  accentColor: string
  autoPlayOnLaunch: boolean
  language: string // 'zh-CN' | 'en-US'
  privacyAccepted: boolean
  enableTelemetry: boolean // Sentry 崩溃上报开关（默认关闭）
  lyricOverlay: LyricOverlaySettings
  hotkeys: Record<string, string> // P2 自定义快捷键
}

// —— 会话上下文（启动自动播放）——
export interface SessionContext {
  lastTrackId?: string
  lastPlaylistId?: string
  lastQueue: Track[]
  lastQueueIndex: number
  lastPosition: number
  lastMode: PlayMode
  savedAt: number
}

// —— 登录态 ——
export interface AuthState {
  isLoggedIn: boolean
  user: UserInfo | null
}

export interface UserInfo {
  mid: number
  name: string
  face: string
}

// —— 歌词 ——
export interface LyricWord {
  time: number
  text: string
}

export interface LyricLine {
  time: number // 秒
  text: string
  words?: LyricWord[] // SPL 逐字
  roman?: string // 罗马音
  translation?: string
}

export interface LyricData {
  type: 'lrc' | 'spl'
  lines: LyricLine[]
  offset: number // 用户偏移（秒，可负）
  source: string // 'netease' | 'qq' | 'kugou' | 'manual'
}

export interface LyricCandidate {
  source: string
  songId: string
  title: string
  artist: string
}

// 主进程抓取的原始歌词（渲染进程负责解析为 LyricData）
export interface LyricFetchResult {
  source: string
  lrc: string
  translation?: string
  roman?: string
}

// —— B 站 ——
export interface VideoPage {
  cid: number
  part: string
  duration: number
}

export interface VideoInfo {
  bvid: string
  aid: number
  cid: number
  title: string
  coverUrl: string
  duration: number
  artist: string
  pages: VideoPage[]
}

export interface SearchResult {
  items: Track[]
  total: number
  hasMore: boolean
}

export interface FavoriteFolder {
  id: number
  title: string
  mediaCount: number
}

export interface FavoriteData {
  folders: FavoriteFolder[]
  items: Track[]
}

export interface QrCodeData {
  url: string
  qrcodeKey: string
}

export type QrPollStatus = 'pending' | 'scanned' | 'success' | 'expired' | 'failed'

export interface QrPollResult {
  status: QrPollStatus
  message: string
  user?: UserInfo
}

export interface PlayUrlResult {
  audioUrl: string
  duration: number
}

// —— 导入 ——
export interface ImportTrackItem {
  title: string
  artist: string
}

export interface ImportResult {
  source: 'netease' | 'qq'
  total: number
  matched: Track[]
  unmatched: ImportTrackItem[]
}

// —— 通用 Result 包装（IPC handler 统一返回）——
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }

// —— 结构化日志（渲染进程经 IPC log:write 汇入主进程）——
export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

export interface LogEntry {
  level: LogLevel
  scope: string
  message: string
  extra?: Record<string, unknown>
}

// —— 自动更新状态（主进程 → 渲染进程 push）——
export type UpdateState =
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateStatus {
  state: UpdateState
  version?: string
  percent?: number
  message?: string
}

// —— Gitee Release 版本信息 ——
export interface ReleaseInfo {
  tag: string
  name: string
  prerelease: boolean // true=测试版，false=稳定版
  publishedAt: string
  body?: string
  size?: number
  url?: string // Windows 安装包下载地址
}

export interface StableUpdateResult {
  hasUpdate: boolean
  currentVersion: string
  latest: ReleaseInfo | null
}
