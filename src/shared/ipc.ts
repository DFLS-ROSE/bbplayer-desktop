// ============================================================================
// BBPlayer Desktop —— IPC 契约（通道名常量 + 请求/响应类型 + Result 工具）
// ============================================================================
import type {
  AuthState,
  FavoriteData,
  ImportResult,
  LyricCandidate,
  LyricFetchResult,
  LogEntry,
  LyricLine,
  PlayHistoryEntry,
  PlaybackProgress,
  Playlist,
  PlaylistType,
  PlayMode,
  PlayUrlResult,
  QrCodeData,
  QrPollResult,
  Result,
  SearchResult,
  SessionContext,
  Settings,
  Track,
  UpdateStatus,
  UserInfo,
  VideoInfo,
  ReleaseInfo,
  StableUpdateResult,
} from './types'

// 通道名常量（渲染 invoke → 主 handle）
export const IPC = {
  // library（数据 CRUD）
  LibraryList: 'library:list',
  LibraryCreate: 'library:create',
  LibraryUpdate: 'library:update',
  LibraryDelete: 'library:delete',
  LibraryAddTracks: 'library:addTracks',
  LibraryRemoveTrack: 'library:removeTrack',
  LibraryListTracks: 'library:listTracks',
  LibrarySearch: 'library:search',
  // history / progress
  HistoryAdd: 'history:add',
  HistoryList: 'history:list',
  ProgressSave: 'progress:save',
  ProgressGet: 'progress:get',
  // settings / session
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
  SessionGet: 'session:get',
  SessionSet: 'session:set',
  // bilibili
  BiliGetVideo: 'bili:getVideo',
  BiliSearch: 'bili:search',
  BiliPlayUrl: 'bili:playUrl',
  BiliResolve: 'bili:resolve',
  BiliQrGenerate: 'bili:qrGenerate',
  BiliQrPoll: 'bili:qrPoll',
  BiliSmsSend: 'bili:smsSend',
  BiliSmsLogin: 'bili:smsLogin',
  BiliCookieLogin: 'bili:cookieLogin',
  BiliLogout: 'bili:logout',
  BiliAuthState: 'bili:authState',
  BiliFavorites: 'bili:favorites',
  BiliSubscriptions: 'bili:subscriptions',
  // lyrics
  LyricsSearch: 'lyrics:search',
  LyricsFetch: 'lyrics:fetch',
  // importer
  Import: 'importer:import',
  // window control
  WindowToggleLyrics: 'window:toggleLyrics',
  // logging
  LogWrite: 'log:write',
  // updater
  AppCheckUpdate: 'app:checkUpdate',
  AppListVersions: 'app:listVersions',
  AppDownloadVersion: 'app:downloadVersion',
  // push（主 → 渲染）
  PlayerCommand: 'player:command',
  LyricsUpdate: 'lyrics:update',
  BiliAuthChanged: 'bili:authChanged',
  AppUpdateStatus: 'app:updateStatus',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

// —— 播放控制命令（主进程 → 渲染进程，媒体键/托盘）——
export type PlayerCommand =
  | { type: 'toggle' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'seek'; position: number }
  | { type: 'setMode'; mode: PlayMode }
  | { type: 'toggleLoudness' }

// —— 歌词联动负载（主窗口 → 主进程 → 歌词悬浮窗）——
export interface LyricsUpdatePayload {
  track: Track | null
  currentLine: LyricLine | null
  nextLine: LyricLine | null
  index: number
}

// —— 请求负载映射（文档化契约；handler 以具体签名为准）——
export interface IpcRequestMap {
  [IPC.LibraryList]: { type?: PlaylistType }
  [IPC.LibraryCreate]: { name: string; type: PlaylistType; sourceId?: string }
  [IPC.LibraryUpdate]: { id: string; patch: { name?: string } }
  [IPC.LibraryDelete]: { id: string }
  [IPC.LibraryAddTracks]: { playlistId: string; tracks: Track[] }
  [IPC.LibraryRemoveTrack]: { playlistId: string; trackId: string }
  [IPC.LibraryListTracks]: { playlistId: string }
  [IPC.LibrarySearch]: { query: string }
  [IPC.HistoryAdd]: { entry: PlayHistoryEntry }
  [IPC.HistoryList]: { limit?: number }
  [IPC.ProgressSave]: { progress: PlaybackProgress }
  [IPC.ProgressGet]: { trackId: string }
  [IPC.SettingsGet]: undefined
  [IPC.SettingsSet]: { patch: Partial<Settings> }
  [IPC.SessionGet]: undefined
  [IPC.SessionSet]: { ctx: SessionContext }
  [IPC.BiliGetVideo]: { bvid: string }
  [IPC.BiliSearch]: { keyword: string; page?: number }
  [IPC.BiliPlayUrl]: { bvid: string; cid: number }
  [IPC.BiliResolve]: { input: string }
  [IPC.BiliQrGenerate]: undefined
  [IPC.BiliQrPoll]: { qrcodeKey: string }
  [IPC.BiliSmsSend]: { phone: string }
  [IPC.BiliSmsLogin]: { phone: string; code: string }
  [IPC.BiliCookieLogin]: { cookie: string }
  [IPC.BiliLogout]: undefined
  [IPC.BiliAuthState]: undefined
  [IPC.BiliFavorites]: undefined
  [IPC.BiliSubscriptions]: undefined
  [IPC.LyricsSearch]: { title: string; artist?: string }
  [IPC.LyricsFetch]: { source: string; songId: string }
  [IPC.Import]: { source: 'netease' | 'qq'; url: string }
  [IPC.WindowToggleLyrics]: undefined
  [IPC.LogWrite]: LogEntry
  [IPC.AppCheckUpdate]: undefined
  [IPC.AppListVersions]: undefined
  [IPC.AppDownloadVersion]: { tag: string }
}

// —— Result 工具 ——
export function ok<T>(data: T): Result<T> {
  return { ok: true, data }
}

export function fail<T = never>(code: string, message: string): Result<T> {
  return { ok: false, error: { code, message } }
}

/** 将可能抛错的函数包装为 Result，避免向渲染层泄漏原始堆栈 */
export async function wrap<T>(fn: () => T | Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (e) {
    const errObj = e as { code?: string; message?: string } | null
    const code = typeof errObj?.code === 'string' ? errObj.code : 'INTERNAL_ERROR'
    const message = errObj?.message ?? (e instanceof Error ? e.message : String(e))
    return { ok: false, error: { code, message } }
  }
}

// —— 渲染进程 window.api 完整接口（preload 实现，index.d.ts 声明）——
export interface RendererApi {
  library: {
    list(type?: PlaylistType): Promise<Result<Playlist[]>>
    create(name: string, type: PlaylistType, sourceId?: string): Promise<Result<Playlist>>
    update(id: string, patch: { name?: string }): Promise<Result<Playlist>>
    delete(id: string): Promise<Result<boolean>>
    addTracks(playlistId: string, tracks: Track[]): Promise<Result<number>>
    removeTrack(playlistId: string, trackId: string): Promise<Result<boolean>>
    listTracks(playlistId: string): Promise<Result<Track[]>>
    search(query: string): Promise<Result<Track[]>>
  }
  history: {
    add(entry: PlayHistoryEntry): Promise<Result<boolean>>
    list(limit?: number): Promise<Result<PlayHistoryEntry[]>>
  }
  progress: {
    save(p: PlaybackProgress): Promise<Result<boolean>>
    get(trackId: string): Promise<Result<PlaybackProgress | null>>
  }
  settings: {
    get(): Promise<Result<Settings>>
    set(patch: Partial<Settings>): Promise<Result<Settings>>
  }
  session: {
    get(): Promise<Result<SessionContext>>
    set(ctx: SessionContext): Promise<Result<boolean>>
  }
  bili: {
    getVideo(bvid: string): Promise<Result<VideoInfo>>
    search(keyword: string, page?: number): Promise<Result<SearchResult>>
    playUrl(bvid: string, cid: number): Promise<Result<PlayUrlResult>>
    resolve(input: string): Promise<Result<{ bvid: string } | null>>
    qrGenerate(): Promise<Result<QrCodeData>>
    qrPoll(qrcodeKey: string): Promise<Result<QrPollResult>>
    smsSend(phone: string): Promise<Result<{ sent: boolean; message: string }>>
    smsLogin(phone: string, code: string): Promise<Result<UserInfo>>
    cookieLogin(rawCookie: string): Promise<Result<UserInfo>>
    logout(): Promise<Result<boolean>>
    authState(): Promise<Result<AuthState>>
    favorites(): Promise<Result<FavoriteData>>
    subscriptions(): Promise<Result<Track[]>>
  }
  lyrics: {
    search(title: string, artist?: string): Promise<Result<LyricCandidate[]>>
    fetch(source: string, songId: string): Promise<Result<LyricFetchResult>>
  }
  importer: {
    import(source: 'netease' | 'qq', url: string): Promise<Result<ImportResult>>
  }
  window: {
    toggleLyrics(): Promise<Result<boolean>>
  }
  onPlayerCommand(cb: (cmd: PlayerCommand) => void): () => void
  onLyricsUpdate(cb: (payload: LyricsUpdatePayload) => void): () => void
  onAuthChanged(cb: (state: AuthState) => void): () => void
  onUpdateStatus(cb: (status: UpdateStatus) => void): () => void
  sendLyricsUpdate(payload: LyricsUpdatePayload): void
  log(entry: LogEntry): Promise<boolean>
  checkUpdate(): Promise<Result<StableUpdateResult>>
  listVersions(): Promise<Result<ReleaseInfo[]>>
  downloadVersion(tag: string): Promise<Result<boolean>>
}
