// 系统托盘 + 右键菜单（播放控制 / 歌词窗 / 显示主窗口 / 退出）
import { app, Menu, nativeImage, Tray } from 'electron'
import { join } from 'node:path'
import { sendPlayerCommand } from './ipc/player'
import { setQuitting, showMainWindow, toggleLyricsWindow } from './window-manager'

let tray: Tray | null = null

export function createTray(): Tray {
  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
  tray = new Tray(icon)

  const menu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => showMainWindow() },
    { type: 'separator' },
    { label: '播放 / 暂停', click: () => sendPlayerCommand({ type: 'toggle' }) },
    { label: '上一首', click: () => sendPlayerCommand({ type: 'prev' }) },
    { label: '下一首', click: () => sendPlayerCommand({ type: 'next' }) },
    {
      label: '循环模式',
      submenu: [
        { label: '顺序播放', click: () => sendPlayerCommand({ type: 'setMode', mode: 'sequence' }) },
        { label: '单曲循环', click: () => sendPlayerCommand({ type: 'setMode', mode: 'loop-one' }) },
        { label: '列表循环', click: () => sendPlayerCommand({ type: 'setMode', mode: 'loop-all' }) },
        { label: '随机播放', click: () => sendPlayerCommand({ type: 'setMode', mode: 'shuffle' }) },
      ],
    },
    { label: '切换响度均衡', click: () => sendPlayerCommand({ type: 'toggleLoudness' }) },
    { label: '显示 / 隐藏歌词悬浮窗', click: () => toggleLyricsWindow() },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        setQuitting(true)
        app.quit()
      },
    },
  ])

  tray.setToolTip('BBPlayer')
  tray.setContextMenu(menu)
  tray.on('click', () => showMainWindow())
  return tray
}

/** 销毁托盘（应用退出时调用，避免托盘图标残留） */
export function destroyTray(): void {
  if (tray && !tray.isDestroyed()) {
    tray.destroy()
  }
  tray = null
}
