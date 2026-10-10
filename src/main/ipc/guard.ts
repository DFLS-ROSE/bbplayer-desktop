// ============================================================================
// BBPlayer Desktop —— IPC 来源校验（安全基线 #9）
// 所有 ipcMain.handle / ipcMain.on 必须经此模块，拒绝未知 / 外部 frame。
// ============================================================================
import { ipcMain } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { logWarn } from '../logger'

type GuardEvent = IpcMainInvokeEvent | IpcMainEvent

/** 仅接受本应用顶层 frame 发起的 IPC：dev 仅 dev server，prod 仅 file: */
function isTrustedSender(event: GuardEvent): boolean {
  const frame = event.senderFrame
  const mainFrame = event.sender.mainFrame
  if (!frame || !mainFrame) return false
  // 拒绝 iframe 内调用（仅顶层 frame）
  if (frame !== mainFrame) return false

  const url = frame.url
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl && url.startsWith(devUrl)) return true
  return url.startsWith('file://')
}

/** invoke 通道来源校验封装 */
export function handleSafe(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => unknown,
): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) {
      logWarn('ipc', '拒绝不受信任的 IPC 调用', { channel, url: event.senderFrame?.url })
      throw new Error(`IPC 调用被拒绝：来源不受信任（${channel}）`)
    }
    return handler(event, ...args)
  })
}

/** on（主→渲染 send 中继 / 渲染 send→主）通道来源校验封装 */
export function handleSafeOn(
  channel: string,
  listener: (event: IpcMainEvent, ...args: any[]) => void,
): void {
  ipcMain.on(channel, (event, ...args) => {
    if (!isTrustedSender(event)) {
      logWarn('ipc', '拒绝不受信任的 IPC 事件', { channel, url: event.senderFrame?.url })
      return
    }
    listener(event, ...args)
  })
}
