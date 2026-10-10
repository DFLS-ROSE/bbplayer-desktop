// 歌词悬浮窗 / 任务栏歌词：置顶、可拖拽、透明度 / 字号调节、接收主窗口歌词联动
// 两种模式：float（屏幕中央悬浮窗）/ taskbar（任务栏空白处横向单行或双行）
import { useEffect, useState } from 'react'
import type { LyricsUpdatePayload } from '@shared/ipc'
import type { LyricLine, LyricOverlaySettings } from '@shared/types'
import { useSettingsStore } from '@renderer/store/settings-store'
import { IconClose } from '@renderer/components/icons'

export function LyricsOverlay() {
  const settings = useSettingsStore((s) => s.settings)
  const load = useSettingsStore((s) => s.load)
  const update = useSettingsStore((s) => s.update)

  const [payload, setPayload] = useState<LyricsUpdatePayload | null>(null)
  const [showControls, setShowControls] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const off = window.api.onLyricsUpdate((p) => setPayload(p))
    return off
  }, [])

  const currentLine: LyricLine | null = payload?.currentLine ?? null
  const nextLine: LyricLine | null = payload?.nextLine ?? null
  const track = payload?.track ?? null

  const overlay = settings.lyricOverlay
  const isTaskbar = overlay.mode === 'taskbar'

  const setOverlay = (patch: Partial<LyricOverlaySettings>): void => {
    void update({ lyricOverlay: { ...overlay, ...patch } })
  }

  if (isTaskbar) {
    return (
      <div
        className="relative h-screen w-screen select-none overflow-hidden"
        style={{ opacity: overlay.opacity }}
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => setShowControls(false)}
      >
        {/* 横向歌词（白字 + 深色描边，浅色/深色任务栏均可见） */}
        <div
          className="flex h-full w-full items-center justify-center px-6"
          style={{ fontSize: overlay.fontSize }}
        >
          {overlay.lines === 2 ? (
            <div className="flex w-full flex-col justify-center">
              <div
                className="w-full truncate font-medium"
                style={taskbarTextStyle(overlay.fontSize)}
              >
                {currentLine?.text || nextLine?.text || '暂无歌词'}
              </div>
              <div
                className="w-full truncate opacity-75"
                style={taskbarTextStyle(Math.round(overlay.fontSize * 0.85))}
              >
                {nextLine?.text || ''}
              </div>
            </div>
          ) : (
            <div
              className="w-full truncate text-center font-medium"
              style={taskbarTextStyle(overlay.fontSize)}
            >
              {currentLine?.text || nextLine?.text || '暂无歌词'}
            </div>
          )}
        </div>

        {showControls && <Controls overlay={overlay} onChange={setOverlay} />}
      </div>
    )
  }

  // —— float 模式：屏幕中央悬浮窗 ——
  return (
    <div
      className="drag-region relative h-screen w-screen select-none overflow-hidden rounded-xl bg-black/60 text-white backdrop-blur-sm"
      style={{ opacity: overlay.opacity }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* 歌词内容 */}
      <div
        className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center"
        style={{ fontSize: overlay.fontSize }}
      >
        {track ? (
          <div className="mb-1 max-w-full truncate text-[0.7em] opacity-60">
            {track.title} - {track.artist}
          </div>
        ) : (
          <div className="mb-1 text-[0.7em] opacity-60">BBPlayer 桌面歌词</div>
        )}

        {currentLine ? (
          <>
            {currentLine.roman && overlay.showRoman && (
              <div className="text-[0.8em] opacity-70">{currentLine.roman}</div>
            )}
            <div className="max-w-full font-medium" style={{ color: 'var(--color-accent)' }}>
              {currentLine.text || '♪'}
            </div>
            {currentLine.translation && overlay.showTranslation && (
              <div className="text-[0.8em] opacity-70">{currentLine.translation}</div>
            )}
          </>
        ) : (
          <div className="opacity-80">{nextLine?.text ?? '暂无歌词'}</div>
        )}

        {nextLine && currentLine && (
          <div className="max-w-full text-[0.85em] opacity-40">{nextLine.text}</div>
        )}
      </div>

      {showControls && <Controls overlay={overlay} onChange={setOverlay} />}
    </div>
  )
}

/** 任务栏歌词文字样式：白字 + 深色描边，保证浅/深任务栏均清晰 */
function taskbarTextStyle(fontSize: number): React.CSSProperties {
  return {
    color: '#ffffff',
    fontSize,
    textShadow: '0 0 4px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.95)',
    lineHeight: 1.2,
  }
}

function Controls({
  overlay,
  onChange,
}: {
  overlay: LyricOverlaySettings
  onChange: (patch: Partial<LyricOverlaySettings>) => void
}) {
  return (
    <div className="no-drag absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-black/50 p-1">
      <button
        className="rounded px-1.5 py-0.5 text-xs hover:bg-white/20"
        onClick={() => onChange({ opacity: Math.max(0.1, overlay.opacity - 0.1) })}
        title="降低透明度"
      >
        −
      </button>
      <button
        className="rounded px-1.5 py-0.5 text-xs hover:bg-white/20"
        onClick={() => onChange({ opacity: Math.min(1, overlay.opacity + 0.1) })}
        title="提高透明度"
      >
        ＋
      </button>
      <button
        className="rounded px-1.5 py-0.5 text-xs hover:bg-white/20"
        onClick={() => onChange({ fontSize: Math.max(12, overlay.fontSize - 1) })}
        title="减小字号"
      >
        A−
      </button>
      <button
        className="rounded px-1.5 py-0.5 text-xs hover:bg-white/20"
        onClick={() => onChange({ fontSize: Math.min(40, overlay.fontSize + 1) })}
        title="增大字号"
      >
        A＋
      </button>
      <button
        className="rounded px-1.5 py-0.5 hover:bg-white/20"
        onClick={() => void window.api.window.toggleLyrics()}
        title="关闭"
      >
        <IconClose size={14} />
      </button>
    </div>
  )
}
