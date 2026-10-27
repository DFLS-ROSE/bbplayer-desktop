// contextBridge 类型安全白名单 API（window.api）
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IPC } from '../shared/ipc'
import type { LyricsUpdatePayload, PlayerCommand, RendererApi } from '../shared/ipc'
import type { AuthState, LogEntry, UpdateStatus } from '../shared/types'

const api: RendererApi = {
  library: {
    list: (type) => ipcRenderer.invoke(IPC.LibraryList, { type }),
    create: (name, type, sourceId) => ipcRenderer.invoke(IPC.LibraryCreate, { name, type, sourceId }),
    update: (id, patch) => ipcRenderer.invoke(IPC.LibraryUpdate, { id, patch }),
    delete: (id) => ipcRenderer.invoke(IPC.LibraryDelete, { id }),
    addTracks: (playlistId, tracks) => ipcRenderer.invoke(IPC.LibraryAddTracks, { playlistId, tracks }),
    removeTrack: (playlistId, trackId) => ipcRenderer.invoke(IPC.LibraryRemoveTrack, { playlistId, trackId }),
    listTracks: (playlistId) => ipcRenderer.invoke(IPC.LibraryListTracks, { playlistId }),
    search: (query) => ipcRenderer.invoke(IPC.LibrarySearch, { query }),
  },
  history: {
    add: (entry) => ipcRenderer.invoke(IPC.HistoryAdd, { entry }),
    list: (limit) => ipcRenderer.invoke(IPC.HistoryList, { limit }),
  },
  progress: {
    save: (progress) => ipcRenderer.invoke(IPC.ProgressSave, { progress }),
    get: (trackId) => ipcRenderer.invoke(IPC.ProgressGet, { trackId }),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.SettingsGet),
    set: (patch) => ipcRenderer.invoke(IPC.SettingsSet, { patch }),
  },
  session: {
    get: () => ipcRenderer.invoke(IPC.SessionGet),
    set: (ctx) => ipcRenderer.invoke(IPC.SessionSet, { ctx }),
  },
  bili: {
    getVideo: (bvid) => ipcRenderer.invoke(IPC.BiliGetVideo, { bvid }),
    search: (keyword, page) => ipcRenderer.invoke(IPC.BiliSearch, { keyword, page }),
    playUrl: (bvid, cid) => ipcRenderer.invoke(IPC.BiliPlayUrl, { bvid, cid }),
    resolve: (input) => ipcRenderer.invoke(IPC.BiliResolve, { input }),
    qrGenerate: () => ipcRenderer.invoke(IPC.BiliQrGenerate),
    qrPoll: (qrcodeKey) => ipcRenderer.invoke(IPC.BiliQrPoll, { qrcodeKey }),
    smsSend: (phone) => ipcRenderer.invoke(IPC.BiliSmsSend, { phone }),
    smsLogin: (phone, code) => ipcRenderer.invoke(IPC.BiliSmsLogin, { phone, code }),
    cookieLogin: (cookie) => ipcRenderer.invoke(IPC.BiliCookieLogin, { cookie }),
    logout: () => ipcRenderer.invoke(IPC.BiliLogout),
    authState: () => ipcRenderer.invoke(IPC.BiliAuthState),
    favorites: () => ipcRenderer.invoke(IPC.BiliFavorites),
    subscriptions: () => ipcRenderer.invoke(IPC.BiliSubscriptions),
  },
  lyrics: {
    search: (title, artist) => ipcRenderer.invoke(IPC.LyricsSearch, { title, artist }),
    fetch: (source, songId, title, artist) =>
      ipcRenderer.invoke(IPC.LyricsFetch, { source, songId, title, artist }),
    getCached: (trackId) => ipcRenderer.invoke(IPC.LyricsGetCached, { trackId }),
    saveCached: (entry) => ipcRenderer.invoke(IPC.LyricsSaveCached, { entry }),
    getOffset: (bvid) => ipcRenderer.invoke(IPC.LyricsGetOffset, { bvid }),
    setOffset: (bvid, title, offsetMs) =>
      ipcRenderer.invoke(IPC.LyricsSetOffset, { bvid, title, offsetMs }),
    listOffsets: (limit) => ipcRenderer.invoke(IPC.LyricsListOffsets, { limit }),
    resetOffset: (bvid) => ipcRenderer.invoke(IPC.LyricsResetOffset, { bvid }),
    clearOffsets: () => ipcRenderer.invoke(IPC.LyricsClearOffsets),
  },
  importer: {
    import: (source, url) => ipcRenderer.invoke(IPC.Import, { source, url }),
  },
  window: {
    toggleLyrics: () => ipcRenderer.invoke(IPC.WindowToggleLyrics),
  },
  onPlayerCommand: (cb) => {
    const listener = (_e: IpcRendererEvent, cmd: PlayerCommand): void => cb(cmd)
    ipcRenderer.on(IPC.PlayerCommand, listener)
    return () => {
      ipcRenderer.removeListener(IPC.PlayerCommand, listener)
    }
  },
  onLyricsUpdate: (cb) => {
    const listener = (_e: IpcRendererEvent, payload: LyricsUpdatePayload): void => cb(payload)
    ipcRenderer.on(IPC.LyricsUpdate, listener)
    return () => {
      ipcRenderer.removeListener(IPC.LyricsUpdate, listener)
    }
  },
  onAuthChanged: (cb) => {
    const listener = (_e: IpcRendererEvent, state: AuthState): void => cb(state)
    ipcRenderer.on(IPC.BiliAuthChanged, listener)
    return () => {
      ipcRenderer.removeListener(IPC.BiliAuthChanged, listener)
    }
  },
  onUpdateStatus: (cb) => {
    const listener = (_e: IpcRendererEvent, status: UpdateStatus): void => cb(status)
    ipcRenderer.on(IPC.AppUpdateStatus, listener)
    return () => {
      ipcRenderer.removeListener(IPC.AppUpdateStatus, listener)
    }
  },
  sendLyricsUpdate: (payload) => {
    ipcRenderer.send(IPC.LyricsUpdate, payload)
  },
  log: (entry: LogEntry) => ipcRenderer.invoke(IPC.LogWrite, entry),
  checkStableUpdate: () => ipcRenderer.invoke(IPC.AppCheckStableUpdate),
  getVersion: () => ipcRenderer.invoke(IPC.AppGetVersion),
  listVersions: () => ipcRenderer.invoke(IPC.AppListVersions),
  downloadVersion: (tag) => ipcRenderer.invoke(IPC.AppDownloadVersion, { tag }),
}

contextBridge.exposeInMainWorld('api', api)
