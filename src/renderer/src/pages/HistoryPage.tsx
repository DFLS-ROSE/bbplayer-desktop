// 播放历史页
import { useHistory } from '@renderer/api/client'
import { TrackList } from '@renderer/components/TrackList'

export function HistoryPage() {
  const { data: history = [], isLoading } = useHistory(200)

  return (
    <div className="mx-auto h-full max-w-4xl overflow-y-auto overflow-x-hidden px-6 py-8">
      <h1 className="mb-4 text-xl font-bold">播放历史</h1>
      {isLoading ? (
        <div className="py-10 text-center text-sm text-[var(--color-text-secondary)]">加载中…</div>
      ) : (
        <TrackList
          tracks={history.map((h) => ({
            id: h.trackId,
            bvid: h.bvid,
            cid: h.cid,
            title: h.title,
            artist: h.artist,
            coverUrl: h.coverUrl,
            duration: h.duration,
            partIndex: h.partIndex,
            partTitle: h.partTitle,
            videoTitle: h.videoTitle,
            source: 'search',
          }))}
          emptyText="暂无播放历史"
        />
      )}
    </div>
  )
}
