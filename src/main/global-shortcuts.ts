// 全局媒体快捷键（Media Session 优先之外的兜底通道）
import { globalShortcut } from 'electron'
import { sendPlayerCommand } from './ipc/player'
import { logWarn } from './logger'

const BINDINGS: [string, () => void][] = [
  ['MediaPlayPause', () => sendPlayerCommand({ type: 'toggle' })],
  ['MediaNextTrack', () => sendPlayerCommand({ type: 'next' })],
  ['MediaPreviousTrack', () => sendPlayerCommand({ type: 'prev' })],
  ['MediaStop', () => sendPlayerCommand({ type: 'pause' })],
]

export function registerGlobalShortcuts(): void {
  for (const [accelerator, handler] of BINDINGS) {
    try {
      globalShortcut.register(accelerator, handler)
    } catch (e) {
      logWarn('shortcuts', `注册全局快捷键 ${accelerator} 失败`, { error: e instanceof Error ? e.message : String(e) })
    }
  }
}

export function unregisterGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
}
