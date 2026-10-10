// 主窗口 + 歌词悬浮窗 创建 / 联动 / 位置持久化
import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { getAppStore } from './store/app-store'
import { hardenWindow } from './security'
import { estimateTaskbarBlank, getTaskbarBlankArea } from './taskbar'

let mainWindow: BrowserWindow | null = null
let lyricsWindow: BrowserWindow | null = null
let isQuitting = false

const PRELOAD = join(__dirname, '../preload/index.js')

function isDev(): boolean {
  return !!process.env['ELECTRON_RENDERER_URL']
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function getLyricsWindow(): BrowserWindow | null {
  return lyricsWindow
}

export function setQuitting(v: boolean): void {
  isQuitting = v
}

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    show: false,
    title: 'BBPlayer',
    backgroundColor: '#0f0f13',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('close', (e) => {
    // 关闭主窗口默认最小化到托盘（退出走托盘菜单，先 setQuitting(true)）
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
  hardenWindow(mainWindow)

  if (isDev()) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return mainWindow
}

export function createLyricsWindow(): BrowserWindow {
  if (lyricsWindow && !lyricsWindow.isDestroyed()) {
    lyricsWindow.show()
    lyricsWindow.focus()
    return lyricsWindow
  }

  const overlay = getAppStore().getSettings().lyricOverlay
  const isTaskbar = overlay.mode === 'taskbar'
  const lines = overlay.lines ?? 1

  let w: number
  let h: number
  let x: number | undefined
  let y: number | undefined
  if (isTaskbar) {
    const blank = estimateTaskbarBlank()
    if (blank) {
      h = lines === 2 ? blank.height * 2 : blank.height
      w = blank.width
      x = blank.x
      y = blank.y - (lines === 2 ? blank.height : 0)
    } else {
      const b = getAppStore().getLyricBounds()
      w = b.width ?? 460
      h = b.height ?? 300
      x = b.x
      y = b.y
    }
  } else {
    const b = getAppStore().getLyricBounds()
    w = b.width ?? 460
    h = b.height ?? 300
    x = b.x
    y = b.y
  }

  lyricsWindow = new BrowserWindow({
    width: w,
    height: h,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: !isTaskbar,
    skipTaskbar: true,
    hasShadow: false,
    title: 'BBPlayer 歌词',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  hardenWindow(lyricsWindow)
  lyricsWindow.setAlwaysOnTop(true, 'screen-saver')
  if (isDev()) {
    void lyricsWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/lyrics.html`)
  } else {
    void lyricsWindow.loadFile(join(__dirname, '../renderer/lyrics.html'))
  }

  // 悬浮模式保存位置；任务栏模式不保存（位置随任务栏探测结果）
  if (!isTaskbar) {
    const saveBounds = (): void => {
      if (!lyricsWindow || lyricsWindow.isDestroyed()) return
      const b = lyricsWindow.getBounds()
      getAppStore().setLyricBounds({ x: b.x, y: b.y, width: b.width, height: b.height })
    }
    lyricsWindow.on('moved', saveBounds)
    lyricsWindow.on('resized', saveBounds)
  }

  // 任务栏模式：异步精确探测并校正位置
  if (isTaskbar) {
    void getTaskbarBlankArea().then((blank) => {
      if (!blank || !lyricsWindow || lyricsWindow.isDestroyed()) return
      const hh = lines === 2 ? blank.height * 2 : blank.height
      lyricsWindow.setBounds({
        x: blank.x,
        y: blank.y - (lines === 2 ? blank.height : 0),
        width: blank.width,
        height: hh,
      })
    })
  }

  lyricsWindow.on('closed', () => {
    lyricsWindow = null
  })
  return lyricsWindow
}

/** 重新定位歌词窗口（用户切换显示模式 / 行数时调用） */
export function repositionLyricsWindow(): void {
  if (!lyricsWindow || lyricsWindow.isDestroyed()) return
  const overlay = getAppStore().getSettings().lyricOverlay
  if (overlay.mode !== 'taskbar') return
  const lines = overlay.lines ?? 1
  const apply = (blank: { x: number; y: number; width: number; height: number }): void => {
    if (!lyricsWindow || lyricsWindow.isDestroyed()) return
    const hh = lines === 2 ? blank.height * 2 : blank.height
    lyricsWindow.setBounds({
      x: blank.x,
      y: blank.y - (lines === 2 ? blank.height : 0),
      width: blank.width,
      height: hh,
    })
  }
  const est = estimateTaskbarBlank()
  if (est) apply(est)
  void getTaskbarBlankArea().then((blank) => {
    if (blank) apply(blank)
  })
}

export function toggleLyricsWindow(): void {
  if (lyricsWindow && !lyricsWindow.isDestroyed() && lyricsWindow.isVisible()) {
    lyricsWindow.hide()
  } else {
    createLyricsWindow()
  }
}

export function showMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
  }
}

export function sendToMain(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

export function sendToLyrics(channel: string, payload: unknown): void {
  if (lyricsWindow && !lyricsWindow.isDestroyed()) {
    lyricsWindow.webContents.send(channel, payload)
  }
}
