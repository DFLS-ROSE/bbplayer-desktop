// 搜索页：智能搜索（关键词 / BV / AV / b23.tv）+ 收藏夹与本地列表内搜索
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Track } from '@shared/types'
import { useSearch } from '@renderer/api/client'
import { engine } from '@renderer/audio/audio-engine'
import { SearchBar } from '@renderer/components/SearchBar'
import { TrackList } from '@renderer/components/TrackList'
import { Spinner, toast } from '@renderer/components/ui'

type Tab = 'bili' | 'local'

export function SearchPage() {
  const [keyword, setKeyword] = useState('')
  const [tab, setTab] = useState<Tab>('bili')
  const [localResults, setLocalResults] = useState<Track[]>([])
  const [resolving, setResolving] = useState(false)

  const { data: biliResult, isLoading } = useSearch(keyword, 1)

  const handleSearch = async (input: string): Promise<void> => {
    setKeyword(input)
    setTab('bili')

    // 先尝试解析 BV/AV/短链，命中则直接播放
    setResolving(true)
    try {
      const resolved = await window.api.bili.resolve(input)
      if (resolved.ok && resolved.data) {
        const r = await window.api.bili.getVideo(resolved.data.bvid)
        if (r.ok) {
          const track: Track = {
            id: `${r.data.bvid}_${r.data.cid}`,
            bvid: r.data.bvid,
            cid: r.data.cid,
            aid: r.data.aid,
            title: r.data.title,
            artist: r.data.artist,
            coverUrl: r.data.coverUrl,
            duration: r.data.duration,
            source: 'search',
          }
          await engine.playTrack(track, [track], 0)
          toast('正在播放', 'success')
          return
        }
      }
    } catch (e) {
      void window.api.log({
        level: 'warn',
        scope: 'search',
        message: '解析失败',
        extra: { error: e instanceof Error ? e.message : String(e) },
      })
    } finally {
      setResolving(false)
    }

    // 本地歌单内搜索
    const local = await window.api.library.search(input)
    if (local.ok) setLocalResults(local.data)
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <SearchBar onSearch={(v) => void handleSearch(v)} />

      <div className="mt-5 flex gap-1 border-b border-black/5 dark:border-white/10">
        <TabBtn active={tab === 'bili'} onClick={() => setTab('bili')}>
          B 站搜索
        </TabBtn>
        <TabBtn active={tab === 'local'} onClick={() => setTab('local')}>
          本地歌单内搜索
        </TabBtn>
      </div>

      <div className="mt-4">
        {resolving ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : tab === 'bili' ? (
          isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <TrackList
              tracks={biliResult?.items ?? []}
              emptyText={keyword ? '未找到相关视频' : '输入关键词开始搜索'}
              onPlay={(index) => {
                const t = biliResult?.items?.[index]
                if (t) void engine.playTrack(t)
              }}
            />
          )
        ) : (
          <TrackList
            tracks={localResults}
            emptyText="本地歌单内未找到匹配内容"
            onPlay={(index) => {
              const t = localResults[index]
              if (t) void engine.playTrack(t)
            }}
          />
        )}
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm transition ${
        active
          ? 'border-b-2 border-[var(--color-accent)] font-medium text-[var(--color-accent)]'
          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
      }`}
    >
      {children}
    </button>
  )
}
