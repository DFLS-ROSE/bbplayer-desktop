// 播放页（展开态）：Apple Music 风格 —— 模糊封面背景 + 大封面 + 行级歌词
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { engine } from '@renderer/audio/audio-engine'
import { usePlayerStore } from '@renderer/store/player-store'
import { LyricsView } from '@renderer/components/LyricsView'
import { VideoParts } from '@renderer/components/VideoParts'
import { ProgressBar, formatTime } from '@renderer/components/ui'
import {
  IconBack,
  IconCheck,
  IconDownload,
  IconLoudness,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconRepeat,
  IconRepeatOne,
  IconShuffle,
} from '@renderer/components/icons'
import { useDownload, useDownloadedIds } from '@renderer/components/use-download'
import type { PlayMode } from '@shared/types'

const MODE_ORDER: PlayMode[] = ['sequence', 'loop-all', 'loop-one', 'shuffle']

export function NowPlayingPage() {
  const track = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const position = usePlayerStore((s) => s.position)
  const duration = usePlayerStore((s) => s.duration)
  const mode = usePlayerStore((s) => s.mode)
  const loudness = usePlayerStore((s) => s.loudness)
  const navigate = useNavigate()
  const location = useLocation()
  const download = useDownload()
  const downloaded = useDownloadedIds()

  // 记住「从哪个页面进来的」，返回时回到那里；直接打开本页则回首页
  const fromPath = useRef('/')
  useEffect(() => {
    if (location.pathname !== '/now-playing') fromPath.current = location.pathname
  }, [location.pathname])

  const goBack = (): void => {
    navigate(fromPath.current === '/now-playing' ? '/' : fromPath.current)
  }

  // Esc 关闭歌词页（输入框里按 Esc 不拦截）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      goBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
    <div className="relative flex h-full min-h-0">
      {/* 背景：模糊放大的封面 + 渐变遮罩（仅装饰，不参与布局） */}
      {track?.coverUrl && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <img
            src={track.coverUrl}
            alt=""
            className="h-full w-full scale-125 object-cover blur-3xl"
            style={{ opacity: 0.35 }}
          />
          <div className="absolute inset-0 bg-[var(--color-bg)]/70" />
        </div>
      )}

      {/* 返回：歌词页没有关闭入口的话，进来之后就只能靠侧栏出去了。
          放在页面根层（不随左栏内容滚动） */}
      <button
        onClick={goBack}
        title="返回（Esc）"
        className="absolute left-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-[var(--color-text-primary)] transition hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
      >
        <IconBack size={20} />
      </button>

      {/* 下载：与左上返回对称放在右上，不挤占底部控制条 */}

      {/* 左：封面 + 信息 + 控制（自身滚动，内容用 margin 垂直居中，空间不足时自动退化为顶部对齐） */}
      <div className="relative z-10 flex w-[44%] min-w-[320px] shrink-0 flex-col overflow-y-auto overflow-x-hidden p-6">
        <div className="my-auto flex flex-col items-center gap-4">
          {track?.coverUrl ? (
            <img
              src={track.coverUrl}
              alt=""
              className="aspect-square w-full max-w-[15rem] rounded-3xl object-cover"
              style={{ boxShadow: 'var(--elevation-3)' }}
            />
          ) : (
            <div
              className="flex aspect-square w-full max-w-[15rem] items-center justify-center rounded-3xl bg-[var(--color-accent-container)] text-5xl text-[var(--color-on-accent-container)]"
              style={{ boxShadow: 'var(--elevation-2)' }}
            >
              ♪
            </div>
          )}

          <div className="w-full max-w-xs text-center">
            <h1 className="line-clamp-2 text-lg font-bold">{track?.title ?? '未在播放'}</h1>
            <p className="mt-1 line-clamp-1 text-sm text-[var(--color-text-secondary)]">
              {track?.artist ?? 'BBPlayer'}
            </p>
            {track?.partIndex != null && (
              <p className="mt-1 line-clamp-1 text-xs text-[var(--color-text-secondary)]">
                P{track.partIndex + 1}
                {track.videoTitle && track.videoTitle !== track.title && ` · ${track.videoTitle}`}
              </p>
            )}
            {/* 下载放在标题下方：右上角是歌词工具条（偏移 / 切换来源 / 粘贴），会被它挤住 */}
            {track && (
              <div className="mt-3 flex justify-center">
                {downloaded.matches(track) ? (
                  <span
                    title="已下载到本地"
                    className="flex items-center gap-1 rounded-full bg-[var(--color-accent)]/15 px-3 py-1 text-xs font-medium text-[var(--color-accent)]"
                  >
                    <IconCheck size={13} />
                    已下载
                  </span>
                ) : (
                  <button
                    onClick={() => void download(track)}
                    title="下载到本地"
                    className="flex items-center gap-1 rounded-full bg-black/5 px-3 py-1 text-xs text-[var(--color-text-secondary)] transition hover:bg-black/10 hover:text-[var(--color-text-primary)] dark:bg-white/10 dark:hover:bg-white/20"
                  >
                    <IconDownload size={13} />
                    下载
                  </button>
                )}
              </div>
            )}
          </div>

          <VideoParts track={track} />

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

            <div className="mt-4 flex items-center justify-center gap-2">
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
      </div>

      {/* 右：歌词 */}
      <div className="relative z-10 min-w-0 flex-1 border-l border-black/5 dark:border-white/10">
        <LyricsView />
      </div>
    </div>
  )
}
