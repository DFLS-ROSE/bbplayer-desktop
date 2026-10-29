// 分P 列表：多P 视频可切换到任意一分P（合集 / 连播 / 分节教程）
import { useEffect, useState } from 'react'
import type { Track, VideoPage } from '@shared/types'
import { buildPartTrackFrom } from '@shared/video-parts'
import { engine } from '@renderer/audio/audio-engine'
import { usePlayerStore } from '@renderer/store/player-store'
import { formatTime } from './ui'

export function VideoParts({ track }: { track: Track | null }) {
  const [pages, setPages] = useState<VideoPage[]>([])

  useEffect(() => {
    if (!track?.bvid) return
    let cancelled = false
    void (async () => {
      const r = await window.api.bili.getVideo(track.bvid)
      if (cancelled) return
      if (r.ok) setPages(r.data.pages ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [track?.bvid])

  if (!track || pages.length <= 1) return null

  const playPart = (index: number): void => {
    const page = pages[index]
    if (!page || page.cid === track.cid) return
    const s = usePlayerStore.getState()
    const queue = s.queue.length ? [...s.queue] : [track]
    let at = queue.findIndex((t) => t.id === track.id)
    if (at < 0) at = s.queueIndex >= 0 && s.queueIndex < queue.length ? s.queueIndex : 0
    const partTrack = buildPartTrackFrom(track, page, index, pages.length)
    queue[at] = partTrack
    void engine.playTrack(partTrack, queue, at)
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-1 flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
        <span>分P</span>
        <span>{pages.length} 个</span>
      </div>
      <div className="max-h-40 overflow-y-auto rounded-xl border border-black/5 dark:border-white/10">
        {pages.map((p, i) => {
          const active = p.cid === track.cid
          return (
            <button
              key={p.cid}
              onClick={() => playPart(i)}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-black/5 dark:hover:bg-white/5 ${
                active ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]' : ''
              }`}
              title={`播放 P${i + 1}：${p.part}`}
            >
              <span className="w-7 shrink-0 text-xs tabular-nums opacity-70">P{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-xs">{p.part}</span>
              <span className="shrink-0 text-xs tabular-nums text-[var(--color-text-secondary)]">
                {formatTime(p.duration)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
