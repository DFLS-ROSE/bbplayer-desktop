// 首页 / 推荐：音乐趣事 + 推荐内容 + 最近播放
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHistory, useSearch } from '@renderer/api/client'
import { TrackList } from '@renderer/components/TrackList'
import { MUSIC_FACTS } from '@renderer/data/music-facts'

export function HomePage() {
  const navigate = useNavigate()
  const { data: history = [] } = useHistory(20)
  const { data: rec } = useSearch('VOCALOID 音乐', 1)
  const [fact, setFact] = useState(() => MUSIC_FACTS[Math.floor(Math.random() * MUSIC_FACTS.length)])

  const nextFact = (): void => {
    let idx = Math.floor(Math.random() * MUSIC_FACTS.length)
    while (MUSIC_FACTS[idx] === fact && MUSIC_FACTS.length > 1) {
      idx = Math.floor(Math.random() * MUSIC_FACTS.length)
    }
    setFact(MUSIC_FACTS[idx])
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <section className="mb-8 rounded-2xl bg-gradient-to-r from-[var(--color-accent)] to-pink-400 p-8 text-white">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">音乐趣事</h1>
          <button
            className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium backdrop-blur transition hover:bg-white/30"
            onClick={nextFact}
          >
            换一条
          </button>
        </div>
        <p className="mt-3 min-h-[3.5rem] text-sm leading-relaxed opacity-95">{fact}</p>
        <button
          className="mt-4 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium backdrop-blur transition hover:bg-white/30"
          onClick={() => navigate('/search')}
        >
          去搜索 →
        </button>
      </section>

      {history.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-base font-semibold">最近播放</h2>
          <TrackList
            tracks={history.map((h) => ({
              id: h.trackId,
              bvid: h.bvid,
              cid: h.cid,
              title: h.title,
              artist: h.artist,
              coverUrl: h.coverUrl,
              duration: 0,
              source: 'search',
            }))}
          />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-base font-semibold">为你推荐</h2>
        <TrackList tracks={rec?.items ?? []} emptyText="推荐加载中…" />
      </section>
    </div>
  )
}
