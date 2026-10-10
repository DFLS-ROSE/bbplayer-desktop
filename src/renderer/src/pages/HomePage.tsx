// 首页 / 推荐：欢迎 + 推荐内容 + 最近播放
import { useNavigate } from 'react-router-dom'
import { useHistory, useSearch } from '@renderer/api/client'
import { TrackList } from '@renderer/components/TrackList'

export function HomePage() {
  const navigate = useNavigate()
  const { data: history = [] } = useHistory(20)
  const { data: rec } = useSearch('VOCALOID 音乐', 1)

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <section className="mb-8 rounded-2xl bg-gradient-to-r from-[var(--color-accent)] to-pink-400 p-8 text-white">
        <h1 className="text-2xl font-bold">BBPlayer Desktop</h1>
        <p className="mt-2 text-sm opacity-90">B 站音频播放器 · 桌面常驻 · 歌词悬浮 · 全局媒体键</p>
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
