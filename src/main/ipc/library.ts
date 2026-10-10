// 数据 CRUD / 历史 / 进度 / 设置 / 会话 的 IPC 处理器
import { IPC, wrap } from '../../shared/ipc'
import { handleSafe } from './guard'
import type {
  PlayHistoryEntry,
  PlaybackProgress,
  PlaylistType,
  SessionContext,
  Settings,
  Track,
} from '../../shared/types'
import type { ServiceDeps } from './index'
import { repositionLyricsWindow } from '../window-manager'

interface CreatePayload {
  name: string
  type: PlaylistType
  sourceId?: string
}

export function registerLibraryHandlers({ repositories, appStore }: ServiceDeps): void {
  // —— 歌单 ——
  handleSafe(IPC.LibraryList, (_e, payload: { type?: PlaylistType }) =>
    wrap(() => repositories.playlists.list(payload?.type)),
  )
  handleSafe(IPC.LibraryCreate, (_e, payload: CreatePayload) =>
    wrap(() => repositories.playlists.create(payload.name, payload.type, payload.sourceId)),
  )
  handleSafe(IPC.LibraryUpdate, (_e, payload: { id: string; patch: { name?: string } }) =>
    wrap(() => {
      const updated = repositories.playlists.update(payload.id, payload.patch)
      if (!updated) throw new Error('歌单不存在')
      return updated
    }),
  )
  handleSafe(IPC.LibraryDelete, (_e, payload: { id: string }) =>
    wrap(() => repositories.playlists.delete(payload.id)),
  )
  handleSafe(IPC.LibraryAddTracks, (_e, payload: { playlistId: string; tracks: Track[] }) =>
    wrap(() => repositories.playlists.addTracks(payload.playlistId, payload.tracks)),
  )
  handleSafe(IPC.LibraryRemoveTrack, (_e, payload: { playlistId: string; trackId: string }) =>
    wrap(() => repositories.playlists.removeTrack(payload.playlistId, payload.trackId)),
  )
  handleSafe(IPC.LibraryListTracks, (_e, payload: { playlistId: string }) =>
    wrap(() => repositories.playlists.listTracks(payload.playlistId)),
  )
  handleSafe(IPC.LibrarySearch, (_e, payload: { query: string }) =>
    wrap(() => repositories.playlists.searchTracks(payload.query)),
  )

  // —— 历史 ——
  handleSafe(IPC.HistoryAdd, (_e, payload: { entry: PlayHistoryEntry }) =>
    wrap(() => repositories.history.add(payload.entry)),
  )
  handleSafe(IPC.HistoryList, (_e, payload: { limit?: number }) =>
    wrap(() => repositories.history.list(payload?.limit ?? 100)),
  )

  // —— 进度 ——
  handleSafe(IPC.ProgressSave, (_e, payload: { progress: PlaybackProgress }) =>
    wrap(() => repositories.progress.save(payload.progress)),
  )
  handleSafe(IPC.ProgressGet, (_e, payload: { trackId: string }) =>
    wrap(() => repositories.progress.get(payload.trackId)),
  )

  // —— 设置 ——
  handleSafe(IPC.SettingsGet, () => wrap(() => appStore.getSettings()))
  handleSafe(IPC.SettingsSet, (_e, payload: { patch: Partial<Settings> }) =>
    wrap(() => {
      const next = appStore.setSettings(payload.patch)
      // 歌词窗口显示模式 / 行数变化时重新定位
      if (payload.patch.lyricOverlay) repositionLyricsWindow()
      return next
    }),
  )

  // —— 会话 ——
  handleSafe(IPC.SessionGet, () => wrap(() => appStore.getSession()))
  handleSafe(IPC.SessionSet, (_e, payload: { ctx: SessionContext }) =>
    wrap(() => {
      appStore.setSession(payload.ctx)
      return true
    }),
  )
}
