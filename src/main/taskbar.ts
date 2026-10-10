// 探测 Windows 任务栏空白区域（歌词嵌入任务栏用）
// 主方案：PowerShell + Win32 API 精确探测（Shell_TrayWnd / TrayNotifyWnd / ReBarWindow32）
// 回退：Electron screen API 估算
import { execFile } from 'node:child_process'
import { screen } from 'electron'
import { logWarn } from './logger'

export interface TaskbarBlankArea {
  x: number
  y: number
  width: number
  height: number
}

const PS_SCRIPT = `
$ErrorActionPreference='SilentlyContinue'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class TaskbarProbe {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll", CharSet=CharSet.Auto)]
  public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
}
"@
function Get-Rect([string]$cls) {
  $h = [TaskbarProbe]::FindWindow($cls, $null)
  if ($h -eq [IntPtr]::Zero) { return $null }
  $r = New-Object TaskbarProbe+RECT
  if (-not [TaskbarProbe]::GetWindowRect($h, [ref]$r)) { return $null }
  return $r
}
$tray = Get-Rect 'Shell_TrayWnd'
$notify = Get-Rect 'TrayNotifyWnd'
$rebar = Get-Rect 'ReBarWindow32'
$o = @{
  trayL = if($tray){$tray.Left}else{-1}
  trayT = if($tray){$tray.Top}else{-1}
  trayR = if($tray){$tray.Right}else{-1}
  trayB = if($tray){$tray.Bottom}else{-1}
  notifyL = if($notify){$notify.Left}else{-1}
  rebarR = if($rebar){$rebar.Right}else{-1}
}
$o | ConvertTo-Json -Compress
`

interface PsResult {
  trayL: number
  trayT: number
  trayR: number
  trayB: number
  notifyL: number
  rebarR: number
}

/** 探测任务栏空白区域（开始按钮/固定图标区 与 系统托盘之间的空闲区域） */
export async function getTaskbarBlankArea(): Promise<TaskbarBlankArea | null> {
  try {
    const r = await runPowerShell()
    if (r && r.trayL >= 0 && r.trayR > r.trayL && r.trayB > r.trayT) {
      const left = r.rebarR > r.trayL ? r.rebarR : r.trayL + 400
      const right = r.notifyL >= r.trayL && r.notifyL <= r.trayR ? r.notifyL : r.trayR - 350
      const width = right - left
      if (width > 100) {
        return { x: left, y: r.trayT, width, height: r.trayB - r.trayT }
      }
    }
  } catch (e) {
    logWarn('taskbar', 'PowerShell 探测任务栏失败，回退估算', {
      error: e instanceof Error ? e.message : String(e),
    })
  }
  return estimateTaskbarBlank()
}

function runPowerShell(): Promise<PsResult | null> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT],
      { timeout: 4000, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null)
        try {
          const j = JSON.parse(stdout.trim())
          resolve({
            trayL: Number(j.trayL),
            trayT: Number(j.trayT),
            trayR: Number(j.trayR),
            trayB: Number(j.trayB),
            notifyL: Number(j.notifyL),
            rebarR: Number(j.rebarR),
          })
        } catch {
          resolve(null)
        }
      },
    )
  })
}

/** 同步估算任务栏空白区域（screen API），用于窗口创建时的初始定位 */
export function estimateTaskbarBlank(): TaskbarBlankArea | null {
  const display = screen.getPrimaryDisplay()
  const { bounds, workArea } = display
  const taskbarHeight = bounds.height - workArea.height
  if (taskbarHeight <= 0) return null
  // 估算：底部任务栏，左预留开始按钮/图标区，右预留托盘
  const leftReserve = 400
  const rightReserve = 350
  const width = bounds.width - leftReserve - rightReserve
  if (width <= 100) return null
  return { x: bounds.x + leftReserve, y: bounds.y + workArea.height, width, height: taskbarHeight }
}
