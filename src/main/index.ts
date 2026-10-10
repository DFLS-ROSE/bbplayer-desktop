// Electron 主进程入口：单实例锁 / 生命周期 / 服务装配 / 窗口 / 托盘 / 快捷键 / 全局兜底
import { app, BrowserWindow, dialog, Menu } from 'electron'
import { registerAllHandlers } from './ipc'
import { initDatabase } from './db/database'
import { Repositories } from './db/repositories'
import { getAppStore } from './store/app-store'
import { HttpClient } from './bilibili/http-client'
import { Buvid3Manager } from './bilibili/buvid3'
import { WbiSigner } from './bilibili/wbi-signer'
import { UrlResolver } from './bilibili/url-resolver'
import { BiliApi } from './bilibili/api'
import { AuthService } from './bilibili/auth'
import { LyricsService } from './lyrics/lyrics-service'
import { createImporterRegistry } from './importer'
import { createMainWindow, getMainWindow, setQuitting } from './window-manager'
import { createTray } from './tray'
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './global-shortcuts'
import { initializeLogger, createTraceId, logError, logInfo, logWarn } from './logger'
import { installSecurityHardening } from './security'
import { initUpdater } from './updater'
import { initSentry } from './sentry'

// 日志尽早可用（异常兜底也依赖它）
initializeLogger()
// 固定应用名 → userData 稳定为 %APPDATA%\BBPlayer，便于卸载时清理全部数据
app.setName('BBPlayer')
app.setAppUserModelId('com.bbplayer.desktop')

// 主进程全局异常兜底：记录后保持存活，避免脆断退出
process.on('uncaughtException', (error) => {
  logError('main', '未捕获异常', {
    traceId: createTraceId(),
    message: error?.message,
    stack: error?.stack,
  })
})

process.on('unhandledRejection', (reason) => {
  logError('main', '未处理的 Promise 拒绝', {
    traceId: createTraceId(),
    reason: reason instanceof Error ? `${reason.message}\n${reason.stack ?? ''}` : String(reason),
  })
})

// render-process-gone 恢复策略：自动 reload 一次（防抖），30s 内 ≥3 次才弹窗
let authService: AuthService | null = null
const renderCrashTimestamps: number[] = []
let lastAutoReloadAt = 0

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = getMainWindow()
    if (win) {
      win.show()
      win.focus()
    }
  })

  void app.whenReady().then(() => {
    // 隐藏顶部默认菜单栏（File/Edit/View/Window）；不影响托盘右键菜单
    Menu.setApplicationMenu(null)

    const appStore = getAppStore()
    initDatabase(app.getPath('userData'))
    const repositories = new Repositories()

    const http = new HttpClient({ getCookie: () => appStore.buildCookie() })
    const wbi = new WbiSigner(http)
    http.setWbiSigner(wbi)
    const buvid3 = new Buvid3Manager(appStore, http)
    const resolver = new UrlResolver(http)
    const api = new BiliApi(http, buvid3, resolver)
    const auth = new AuthService(api, appStore)
    authService = auth
    http.setOnAuthFailure(() => auth.handleAuthFailure('登录已过期，请重新登录'))
    const lyricsService = new LyricsService()
    const importers = createImporterRegistry(api)

    registerAllHandlers({ repositories, appStore, api, auth, lyricsService, importers })
    installSecurityHardening()

    createMainWindow()
    createTray()
    registerGlobalShortcuts()

    // 登录态：启动校验 + 定期探活
    void auth.verifySession()
    auth.startProbe()

    // 自动更新 + 崩溃上报（P2 预留，默认关闭）
    initUpdater()
    void initSentry(appStore)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('before-quit', () => setQuitting(true))
  app.on('will-quit', () => {
    authService?.stopProbe()
    unregisterGlobalShortcuts()
  })

  app.on('render-process-gone', (_event, webContents, details) => {
    const traceId = createTraceId()
    logError('main', '渲染进程崩溃', { traceId, reason: details.reason, exitCode: details.exitCode })
    const now = Date.now()
    renderCrashTimestamps.push(now)
    while (renderCrashTimestamps.length > 0 && now - renderCrashTimestamps[0] > 30_000) {
      renderCrashTimestamps.shift()
    }
    const shouldAutoReload = now - lastAutoReloadAt > 30_000
    if (shouldAutoReload) {
      lastAutoReloadAt = now
      logInfo('main', '渲染进程崩溃，自动重载一次', { traceId })
      if (webContents && !webContents.isDestroyed()) webContents.reload()
    }
    if (renderCrashTimestamps.length >= 3) {
      logWarn('main', '渲染进程 30s 内多次崩溃', { traceId, count: renderCrashTimestamps.length })
      void dialog.showMessageBox({
        type: 'error',
        title: 'BBPlayer',
        message: '渲染进程多次崩溃',
        detail: '程序将保持运行，建议重启应用以恢复。',
      })
    }
  })

  app.on('child-process-gone', (_event, details) => {
    logWarn('main', '子进程退出', {
      traceId: createTraceId(),
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
    })
  })

  // 常驻托盘：窗口全部关闭也不退出
  app.on('window-all-closed', () => {
    /* no-op：保持托盘常驻 */
  })
}
