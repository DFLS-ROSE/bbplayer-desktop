// IPC 中央注册入口：registerAllHandlers(deps) 增量注册各领域处理器
import { app } from 'electron'
import { IPC, wrap } from '../../shared/ipc'
import type { LyricsUpdatePayload } from '../../shared/ipc'
import type { LogEntry } from '../../shared/types'
import { sendToLyrics } from '../window-manager'
import { writeLogEntry } from '../logger'
import { checkStableUpdate, listVersions, downloadAndInstall } from '../updater'
import { handleSafe, handleSafeOn } from './guard'
import type { AppStore } from '../store/app-store'
import type { Repositories } from '../db/repositories'
import type { BiliApi } from '../bilibili/api'
import type { AuthService } from '../bilibili/auth'
import type { LyricsService } from '../lyrics/lyrics-service'
import type { ImporterRegistry } from '../importer'
import { registerLibraryHandlers } from './library'
import { registerBilibiliHandlers } from './bilibili'
import { registerPlayerHandlers } from './player'
import { registerDownloadHandlers } from './download'

export interface ServiceDeps {
  repositories: Repositories
  appStore: AppStore
  api: BiliApi
  auth: AuthService
  lyricsService: LyricsService
  importers: ImporterRegistry
}

export function registerAllHandlers(deps: ServiceDeps): void {
  registerLibraryHandlers(deps)
  registerBilibiliHandlers(deps)
  registerPlayerHandlers(deps)
  registerDownloadHandlers(deps)

  // 主窗口 → 主进程 → 歌词窗口 的歌词联动中继（同通道 send，来源校验）
  handleSafeOn(IPC.LyricsUpdate, (_e, payload: LyricsUpdatePayload) => {
    sendToLyrics(IPC.LyricsUpdate, payload)
  })

  // —— 渲染进程日志汇入主进程同一文件 ——
  handleSafe(IPC.LogWrite, (_e, entry: LogEntry) => {
    writeLogEntry(entry)
    return true
  })

  // —— 内置更新（GitHub Releases）——
  handleSafe(IPC.AppGetVersion, () => wrap(() => app.getVersion()))
  handleSafe(IPC.AppCheckStableUpdate, () => wrap(() => checkStableUpdate()))
  handleSafe(IPC.AppListVersions, () => wrap(() => listVersions()))
  handleSafe(IPC.AppDownloadVersion, (_e, p: { tag: string }) =>
    wrap(async () => {
      await downloadAndInstall(p.tag)
      return true
    }),
  )
}
