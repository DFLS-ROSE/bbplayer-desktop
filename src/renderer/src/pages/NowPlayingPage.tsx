// 播放页（展开态）：Apple Music 风格 —— 模糊封面背景 + 大封面 + 行级歌词
import { engine } from '@renderer/audio/audio-engine'
import { usePlayerStore } from '@renderer/store/player-store'
import { LyricsView } from '@renderer/components/LyricsView'
import { ProgressBar, formatTime } from '@renderer/components/ui'
import {
  IconLoudness,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconRepeat,
  IconRepeatOne,
  IconShuffle,
} from '@renderer/components/icons'
import type { PlayMode } from '@shared/types'

const MODE_ORDER: PlayMode[] = ['sequence', 'loop-all', 'loop-one', 'shuffle']

export function NowPlayingPage() {
  const track = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const position = usePlayerStore((s) => s.position)
  const duration = usePlayerStore((s) => s.duration)
  const mode = usePlayerStore((s) => s.mode)
  const loudness = usePlayerStore((s) => s.loudness)

  const cycleMode = (): void => {
    const idx = MODE_ORDER.indexOf(mode)
    usePlayerStore.getState().setMode(MODE_ORDER[(idx + 1) % MODE_ORDER.length])
  }

  const modeIcon =
    mode === 'shuffle' ? (
      <IconShuffle size={18} />
    ) : mode === 'loop-one' ? (
      <IconRepeatOne size={18} />
    ) : (
      <IconRepeat size={18} />
    )

  return (
    <div className="relative flex h-full overflow-hidden">
      {/* 背景：模糊放大的封面 + 渐变遮罩 */}
      {track?.coverUrl && (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <img
            src={track.coverUrl}
            alt=""
            className="h-full w-full scale-125 object-cover blur-3xl"
            style={{ opacity: 0.35 }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--color-bg)]/55 to-[var(--color-bg)]/92" />
        </div>
      )}

      {/* 前景 */}
      <div className="relative z-10 flex h-full w-full">
        {/* 左：封面 + 信息 + 控制 */}
        <div className="flex w-[42%] min-w-[320px] shrink-0 flex-col items-center justify-center gap-6 p-8">
          {track?.coverUrl ? (
            <img
              src={track.coverUrl}
              alt=""
              className="h-60 w-60 rounded-3xl object-cover"
              style={{ boxShadow: 'var(--elevation-3)' }}
            />
          ) : (
            <div
              className="flex h-60 w-60 items-center justify-center rounded-3xl bg-[var(--color-accent-container)] text-6xl text-[var(--color-on-accent-container)]"
              style={{ boxShadow: 'var(--elevation-2)' }}
            >
              ♪
            </div>
          )}

          <div className="w-full max-w-xs text-center">
            <h1 className="line-clamp-2 text-xl font-bold">{track?.title ?? '未在播放'}</h1>
            <p className="mt-1 line-clamp-1 text-sm text-[var(--color-text-secondary)]">
              {track?.artist ?? 'BBPlayer'}
            </p>
          </div>

          <div className="w-full max-w-sm">
            <div className="flex w-full items-center gap-2 text-xs tabular-nums text-[var(--color-text-secondary)]">
              <span className="shrink-0">{formatTime(position)}</span>
              <ProgressBar
                value={position}
                max={duration || track?.duration || 0}
                onSeek={(v) => engine.seek(v)}
                className="flex-1"
              />
              <span className="shrink-0">{formatTime(duration || track?.duration || 0)}</span>
            </div>

            <div className="mt-4 flex items-center justify-center gap-4">
              <button
                onClick={cycleMode}
                title="播放模式"
                className={`flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10 ${
                  mode === 'sequence' ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-accent)]'
                }`}
              >
                {modeIcon}
              </button>
              <button
                onClick={() => engine.prev()}
                title="上一首"
                className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-text-primary)] transition hover:bg-black/5 dark:hover:bg-white/10"
              >
                <IconPrev size={22} />
              </button>
              <button
                onClick={() => engine.toggle()}
                title={isPlaying ? '暂停' : '播放'}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-on-accent)] transition hover:opacity-90"
                style={{ boxShadow: 'var(--elevation-2)' }}
              >
                {isPlaying ? <IconPause size={26} /> : <IconPlay size={26} />}
              </button>
              <button
                onClick={() => engine.next()}
                title="下一首"
                className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-text-primary)] transition hover:bg-black/5 dark:hover:bg-white/10"
              >
                <IconNext size={22} />
              </button>
              <button
                onClick={() => engine.setLoudness(!loudness)}
                title="响度均衡"
                className={`flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10 ${
                  loudness ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)]'
                }`}
              >
                <IconLoudness size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* 右：歌词 */}
        <div className="min-w-0 flex-1">
          <LyricsView />
        </div>
      </div>
    </div>
  )
}
