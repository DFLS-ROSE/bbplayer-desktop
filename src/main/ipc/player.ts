// 播放控制 / 窗口控制 处理器 + 播放命令推送辅助
import { IPC, wrap } from '../../shared/ipc'
import { handleSafe } from './guard'
import type { PlayerCommand } from '../../shared/ipc'
import { sendToMain, isLyricsWindowVisible, toggleLyricsWindow } from '../window-manager'
import type { ServiceDeps } from './index'

export function registerPlayerHandlers(_deps: ServiceDeps): void {
  handleSafe(IPC.WindowToggleLyrics, () => wrap(() => toggleLyricsWindow()))
  handleSafe(IPC.WindowLyricsVisible, () => wrap(() => isLyricsWindowVisible()))
}

/** 从主进程（托盘 / 全局快捷键）向主窗口推送播放命令 */
export function sendPlayerCommand(cmd: PlayerCommand): void {
  sendToMain(IPC.PlayerCommand, cmd)
}
