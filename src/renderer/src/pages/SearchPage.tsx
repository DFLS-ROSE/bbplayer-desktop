// 搜索页：智能搜索（关键词 / BV / AV / b23.tv）+ 收藏夹与本地列表内搜索
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Track } from '@shared/types'
import { buildPartTracks } from '@shared/video-parts'
import { useSearch } from '@renderer/api/client'
import { engine } from '@renderer/audio/audio-engine'
import { SearchBar } from '@renderer/components/SearchBar'
import { TrackList } from '@renderer/components/TrackList'
import { Spinner } from '@renderer/components/ui'

type Tab = 'bili' | 'local'

/** 精确识别到的视频（BV / AV / 短链），按分 P 展开 */
interface DirectHit {
  title: string
  partCount: number
  tracks: Track[]
}

export function SearchPage() {
  const [keyword, setKeyword] = useState('')
  const [tab, setTab] = useState<Tab>('bili')
  const [localResults, setLocalResults] = useState<Track[]>([])
  const [resolving, setResolving] = useState(false)
  const [direct, setDirect] = useState<DirectHit | null>(null)

  const { data: biliResult, isLoading } = useSearch(keyword, 1)

  const handleSearch = async (input: string): Promise<void> => {
    const trimmed = input.trim()
    setTab('bili')
    setLocalResults([])
    setDirect(null)
    if (!trimmed) {
      setKeyword('')
      return
    }

    // 先尝试把输入当作 BV / AV / 短链解析
    setResolving(true)
    try {
      const resolved = await window.api.bili.resolve(trimmed)
      if (resolved.ok && resolved.data) {
        const r = await window.api.bili.getVideo(resolved.data.bvid)
        if (r.ok) {
          // 识别成功：作为结果展示，由用户点播放（不再自动播放）；
          // 多 P 视频逐 P 列出，每个 P 都能单独播放
          const tracks = buildPartTracks(r.data)
          setDirect({ title: r.data.title, partCount: tracks.length, tracks })
          setKeyword('') // 精确识别命中，不再做关键词搜索
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

    // 普通关键词：B 站搜索 + 本地歌单内搜索
    setKeyword(trimmed)
    const local = await window.api.library.search(trimmed)
    if (local.ok) setLocalResults(local.data)
  }

  return (
    <div className="mx-auto h-full max-w-4xl overflow-y-auto overflow-x-hidden px-6 py-8">
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
          direct ? (
            <div>
              <p className="mb-2 text-xs text-[var(--color-text-secondary)]">
                识别到视频：{direct.title}
                {direct.partCount > 1 && ` · 共 ${direct.partCount} 个分P，点击播放任一分P`}
              </p>
              <TrackList
                tracks={direct.tracks}
                emptyText="未找到该视频"
                onPlay={(index) => {
                  const t = direct.tracks[index]
                  if (t) void engine.playTrack(t, direct.tracks, index)
                }}
              />
            </div>
          ) : isLoading ? (
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
