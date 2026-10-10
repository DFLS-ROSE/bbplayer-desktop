// ============================================================================
// BBPlayer Desktop —— 自动更新封装（electron-updater）
// autoDownload + 事件 → logger + 渲染层 push；下载完成 → quitAndInstall。
// ============================================================================
import { autoUpdater } from 'electron-updater'
import { IPC } from '../shared/ipc'
import type { UpdateStatus } from '../shared/types'
import { createTraceId, logError, logInfo, logWarn } from './logger'
import { sendToMain } from './window-manager'

function push(status: UpdateStatus): void {
  sendToMain(IPC.AppUpdateStatus, status)
}

/** 初始化自动更新（app.whenReady 后调用一次） */
export function initUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    logInfo('updater', '检查更新', { traceId: createTraceId() })
    push({ state: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    logInfo('updater', '发现新版本', { traceId: createTraceId(), version: info.version })
    push({ state: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', (info) => {
    logInfo('updater', '当前已是最新版本', { traceId: createTraceId(), version: info.version })
    push({ state: 'not-available', version: info.version })
  })

  autoUpdater.on('download-progress', (progress) => {
    push({ state: 'downloading', percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    logInfo('updater', '更新已下载，等待安装', { traceId: createTraceId(), version: info.version })
    push({ state: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    logError('updater', '更新失败', { traceId: createTraceId(), error: err?.message ?? String(err) })
    push({ state: 'error', message: err?.message ?? String(err) })
  })
}

/** 触发一次检查更新；失败不抛出（更新失败不损坏现有安装，下次启动重查） */
export async function checkForUpdates(): Promise<boolean> {
  try {
    await autoUpdater.checkForUpdates()
    return true
  } catch (e) {
    logWarn('updater', '检查更新调用失败', {
      traceId: createTraceId(),
      error: e instanceof Error ? e.message : String(e),
    })
    return false
  }
}

/** 下载完成后由渲染层「重启安装」按钮触发 */
export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
