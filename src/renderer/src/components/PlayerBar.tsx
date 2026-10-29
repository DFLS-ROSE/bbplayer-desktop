// 底部常驻播放控制栏（MD3 图标）
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { PLAY_MODES } from '@shared/constants'
import type { PlayMode } from '@shared/types'
import { engine } from '@renderer/audio/audio-engine'
import { usePlayerStore } from '@renderer/store/player-store'
import { QueuePanel } from './QueuePanel'
import { ProgressBar, formatTime } from './ui'
import {
  IconLoudness,
  IconLyrics,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconQueue,
  IconRepeat,
  IconRepeatOne,
  IconShuffle,
} from './icons'

const MODE_ORDER: PlayMode[] = ['sequence', 'loop-all', 'loop-one', 'shuffle']

export function PlayerBar() {
  const navigate = useNavigate()
  const [queueOpen, setQueueOpen] = useState(false)
  /** 桌面歌词悬浮窗是否开着（按钮要能看出状态，否则用户不知道它开着没） */
  const [lyricsVisible, setLyricsVisible] = useState(false)

  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const position = usePlayerStore((s) => s.position)
  const duration = usePlayerStore((s) => s.duration)
  const volume = usePlayerStore((s) => s.volume)
  const loudness = usePlayerStore((s) => s.loudness)
  const mode = usePlayerStore((s) => s.mode)

  useEffect(() => {
    void (async () => {
      const r = await window.api.window.lyricsVisible()
      if (r.ok) setLyricsVisible(r.data)
    })()
  }, [])

  const toggleLyrics = async (): Promise<void> => {
    const r = await window.api.window.toggleLyrics()
    setLyricsVisible(r.ok ? r.data : !lyricsVisible)
  }
  const audioLabel = usePlayerStore((s) => s.audioLabel)

  const cycleMode = (): void => {
    const idx = MODE_ORDER.indexOf(mode)
    usePlayerStore.getState().setMode(MODE_ORDER[(idx + 1) % MODE_ORDER.length])
  }

  const modeLabel = PLAY_MODES.find((m) => m.value === mode)?.label ?? mode

  return (
    <footer className="relative shrink-0 border-t border-black/5 bg-[var(--color-surface)] dark:border-white/10">
      {queueOpen && (
        <div className="absolute bottom-full left-0 right-0 z-40 h-72 border-t border-black/5 bg-[var(--color-surface)] dark:border-white/10">
          <QueuePanel />
        </div>
      )}

      <div className="flex items-center gap-4 px-4 py-3">
        {/* 曲目信息 */}
        <div
          className="flex w-36 min-w-0 shrink cursor-pointer items-center gap-3 xl:w-52"
          onClick={() => navigate('/now-playing')}
        >
          {currentTrack?.coverUrl ? (
            <img src={currentTrack.coverUrl} alt="" className="h-11 w-11 rounded-xl object-cover" />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-accent-container)] text-[var(--color-on-accent-container)]">
              ♪
            </div>
          )}
          <div className="min-w-0">
            <div className="line-clamp-1 text-sm font-medium">{currentTrack?.title ?? '未在播放'}</div>
            <div className="line-clamp-1 text-xs text-[var(--color-text-secondary)]">
              {currentTrack?.artist ?? 'BBPlayer'}
            </div>
          </div>
        </div>

        {/* 控制按钮 */}
        <div className="flex shrink-0 items-center gap-1">
          <ControlBtn label="上一首" onClick={() => engine.prev()}>
            <IconPrev />
          </ControlBtn>
          <ControlBtn label={isPlaying ? '暂停' : '播放'} onClick={() => engine.toggle()} accent>
            {isPlaying ? <IconPause size={22} /> : <IconPlay size={22} />}
          </ControlBtn>
          <ControlBtn label="下一首" onClick={() => engine.next()}>
            <IconNext />
          </ControlBtn>
          <ControlBtn label={modeLabel} onClick={cycleMode} active={mode !== 'sequence'}>
            {mode === 'shuffle' ? (
              <IconShuffle />
            ) : mode === 'loop-one' ? (
              <IconRepeatOne />
            ) : (
              <IconRepeat />
            )}
          </ControlBtn>
          <ControlBtn label="响度均衡" onClick={() => engine.setLoudness(!loudness)} active={loudness}>
            <IconLoudness />
          </ControlBtn>
        </div>

        {/* 进度 */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-xs tabular-nums text-[var(--color-text-secondary)]">
            {formatTime(position)}
          </span>
          <ProgressBar
            value={position}
            max={duration || currentTrack?.duration || 0}
            onSeek={(v) => engine.seek(v)}
            className="flex-1"
          />
          <span className="shrink-0 text-xs tabular-nums text-[var(--color-text-secondary)]">
            {formatTime(duration || currentTrack?.duration || 0)}
          </span>
        </div>

        {/* 右侧 */}
        <div className="flex shrink-0 items-center gap-1">
          {audioLabel && (
            <span
              className="mr-1 hidden shrink-0 rounded-md border border-black/10 px-1.5 py-0.5 text-[11px] tabular-nums text-[var(--color-text-secondary)] sm:inline dark:border-white/15"
              title={`当前音质 ${audioLabel}（可在设置里调整）`}
            >
              {audioLabel}
            </span>
          )}
          <div className="hidden items-center gap-1 lg:flex">
            <span className="text-xs text-[var(--color-text-secondary)]">音量</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => engine.setVolume(Number(e.target.value))}
              className="h-1 w-20 cursor-pointer accent-[var(--color-accent)]"
            />
          </div>
          <ControlBtn
            label={lyricsVisible ? '关闭歌词悬浮窗' : '歌词悬浮窗'}
            onClick={() => void toggleLyrics()}
            active={lyricsVisible}
          >
            <IconLyrics />
          </ControlBtn>
          <ControlBtn label="播放队列" onClick={() => setQueueOpen((v) => !v)} active={queueOpen}>
            <IconQueue />
          </ControlBtn>
        </div>
      </div>
    </footer>
  )
}

function ControlBtn(props: {
  children: ReactNode
  onClick: () => void
  label: string
  accent?: boolean
  active?: boolean
}) {
  const { children, onClick, label, accent, active } = props
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex h-9 items-center justify-center rounded-full transition ${
        accent
          ? 'w-10 bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:opacity-90'
          : `w-9 hover:bg-black/5 dark:hover:bg-white/10 ${
              active ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-primary)]'
            }`
      }`}
    >
      {children}
    </button>
  )
}
