// 下载相关 IPC 处理器：入队 / 取消 / 列表 / 删除 / 打开目录
import { IPC, wrap } from '../../shared/ipc'
import { handleSafe } from './guard'
import type { ServiceDeps } from './index'
import { getDownloadManager, removeDownloadedFile } from '../downloader'
import { unregisterLocalFile } from '../local-protocol'
import { shell } from 'electron'
import { logInfo } from '../logger'

export function registerDownloadHandlers(_deps: ServiceDeps): void {
  const manager = getDownloadManager()

  handleSafe(IPC.DownloadStart, (_e, payload: { track: { trackId?: string; bvid: string; cid: number; title: string; artist: string; coverUrl: string; duration: number } }) =>
    wrap(() => {
      const t = payload.track
      manager.enqueue({
        trackId: t.trackId ?? `${t.bvid}_${t.cid}`,
        bvid: t.bvid,
        cid: t.cid,
        title: t.title,
        artist: t.artist,
        coverUrl: t.coverUrl,
        duration: t.duration,
      })
      return true
    }),
  )

  handleSafe(IPC.DownloadCancel, (_e, payload: { trackId: string }) =>
    wrap(() => {
      manager.cancel(payload.trackId)
      return true
    }),
  )

  // 已完成下载的记录（从库里读，含文件大小与音质）；下载中的任务走进度推送
  handleSafe(IPC.DownloadList, () => wrap(() => _deps.repositories.downloads.list()))

  handleSafe(IPC.DownloadRemove, (_e, payload: { trackId: string }) =>
    wrap(() => {
      const rec = _deps.repositories.downloads.get(payload.trackId)
      if (!rec) return false
      removeDownloadedFile(rec.filePath)
      unregisterLocalFile(payload.trackId)
      _deps.repositories.downloads.remove(payload.trackId)
      logInfo('download', '已删除下载记录', { trackId: payload.trackId })
      return true
    }),
  )

  handleSafe(IPC.DownloadOpenFolder, () =>
    wrap(() => {
      const dir = manager.getDownloadDir()
      void shell.openPath(dir)
      return true
    }),
  )
}
