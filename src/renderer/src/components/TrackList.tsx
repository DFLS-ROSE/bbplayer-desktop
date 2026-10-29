// 歌曲列表：点击播放 / 加入歌单 / 批量添加（多选）
import { useState } from 'react'
import type { Track } from '@shared/types'
import { queryClient, usePlaylists } from '@renderer/api/client'
import { engine } from '@renderer/audio/audio-engine'
import { usePlayerStore } from '@renderer/store/player-store'
import { Button, Modal, formatTime, toast } from './ui'
import { IconCheck, IconClose, IconPause, IconPlay, IconPlus } from './icons'

interface Props {
  tracks: Track[]
  emptyText?: string
  onPlay?: (index: number) => void
  removable?: boolean
  onRemove?: (trackId: string) => void
  /** 是否显示「批量添加」入口（默认开启） */
  selectable?: boolean
}

export function TrackList({
  tracks,
  emptyText = '暂无内容',
  onPlay,
  removable,
  onRemove,
  selectable = true,
}: Props) {
  const current = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  /** 待加入歌单的曲目（1 首 = 单条添加，N 首 = 批量添加） */
  const [addTarget, setAddTarget] = useState<Track[] | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])

  if (tracks.length === 0) {
    return <div className="py-16 text-center text-sm text-[var(--color-text-secondary)]">{emptyText}</div>
  }

  const playAt = (index: number): void => {
    const t = tracks[index]
    // 点击当前曲目：切换播放/暂停（图标已显示暂停，行为需一致）
    if (current?.id === t.id) {
      engine.toggle()
      return
    }
    if (onPlay) onPlay(index)
    else void engine.playTrack(t, tracks, index)
  }

  const toggleSelect = (id: string): void => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const exitSelect = (): void => {
    setSelecting(false)
    setSelected([])
  }

  const selectedTracks = tracks.filter((t) => selected.includes(t.id))
  const allSelected = selected.length === tracks.length

  return (
    <>
      {selectable && tracks.length > 1 && (
        <div className="sticky top-0 z-10 mb-1 flex items-center justify-end gap-3 bg-[var(--color-bg)]/85 py-1.5 text-xs backdrop-blur">
          {selecting ? (
            <>
              <span className="text-[var(--color-text-secondary)]">已选 {selected.length} 首</span>
              <button
                className="text-[var(--color-accent)] transition hover:opacity-80"
                onClick={() => setSelected(allSelected ? [] : tracks.map((t) => t.id))}
              >
                {allSelected ? '取消全选' : '全选'}
              </button>
              {selectedTracks.length > 0 && (
                <Button
                  onClick={() => {
                    setAddTarget(selectedTracks)
                    exitSelect()
                  }}
                >
                  加入歌单
                </Button>
              )}
              <button
                className="text-[var(--color-text-secondary)] transition hover:opacity-80"
                onClick={exitSelect}
              >
                退出多选
              </button>
            </>
          ) : (
            <button
              className="flex items-center gap-1 text-[var(--color-text-secondary)] transition hover:text-[var(--color-accent)]"
              onClick={() => setSelecting(true)}
              title="勾选多首后一次性加入歌单"
            >
              <IconCheck size={13} />
              批量添加
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col">
        {tracks.map((t, i) => {
          const isCurrent = current?.id === t.id
          const isSelected = selected.includes(t.id)
          return (
            <div
              key={`${t.id}_${i}`}
              className={`group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-black/5 dark:hover:bg-white/5 ${
                isCurrent ? 'bg-[var(--color-accent)]/10' : ''
              } ${isSelected ? 'bg-[var(--color-accent)]/[0.16]' : ''}`}
              onDoubleClick={() => (selecting ? toggleSelect(t.id) : playAt(i))}
              onClick={() => {
                if (selecting) toggleSelect(t.id)
              }}
            >
              {selecting ? (
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition ${
                    isSelected
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                      : 'border-black/15 text-transparent dark:border-white/25'
                  }`}
                  aria-label={isSelected ? '取消选择' : '选择'}
                >
                  <IconCheck size={16} />
                </span>
              ) : (
                <button
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--color-accent)] hover:bg-[var(--color-accent-container)]"
                  onClick={() => playAt(i)}
                  aria-label="播放"
                >
                  {isCurrent && isPlaying ? <IconPause size={16} /> : <IconPlay size={16} />}
                </button>
              )}
              <img
                src={t.coverUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-md object-cover"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.visibility = 'hidden'
                }}
              />
              <div className="min-w-0 flex-1">
                <div className={`line-clamp-1 text-sm ${isCurrent ? 'text-[var(--color-accent)]' : ''}`}>
                  {t.title}
                </div>
                <div className="line-clamp-1 text-xs text-[var(--color-text-secondary)]">
                  {t.artist}
                  {/* 分P 曲目光有「上/下/过程」这类名字看不出属于哪个视频，补上主标题 */}
                  {t.videoTitle && t.videoTitle !== t.title && ` · ${t.videoTitle}`}
                </div>
              </div>
              {t.partIndex != null && (
                <span
                  className="shrink-0 rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--color-text-secondary)] dark:bg-white/10"
                  title={t.partTitle ? `分P ${t.partIndex + 1}` : undefined}
                >
                  P{t.partIndex + 1}
                </span>
              )}
              <span className="shrink-0 text-xs text-[var(--color-text-secondary)]">{formatTime(t.duration)}</span>
              {!selecting && (
                <button
                  className="shrink-0 rounded p-1.5 text-[var(--color-text-secondary)] opacity-0 transition hover:bg-black/5 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    setAddTarget([t])
                  }}
                  title="加入歌单"
                >
                  <IconPlus size={15} />
                </button>
              )}
              {removable && onRemove && (
                <button
                  className="shrink-0 rounded p-1.5 text-[var(--color-text-secondary)] opacity-0 transition hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(t.id)
                  }}
                  title="移除"
                >
                  <IconClose size={14} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {addTarget && (
        <AddToPlaylistModal
          tracks={addTarget}
          onClose={() => {
            setAddTarget(null)
            exitSelect()
          }}
        />
      )}
    </>
  )
}

function AddToPlaylistModal({ tracks, onClose }: { tracks: Track[]; onClose: () => void }) {
  const { data: playlists = [] } = usePlaylists()
  const local = playlists.filter((p) => p.type === 'local')
  const many = tracks.length > 1

  const add = async (playlistId: string): Promise<void> => {
    const r = await window.api.library.addTracks(playlistId, tracks)
    if (r.ok) {
      await queryClient.invalidateQueries({ queryKey: ['playlists'] })
      // 目标歌单的曲目列表也要失效，否则详情页还显示旧内容
      await queryClient.invalidateQueries({ queryKey: ['playlist-tracks', playlistId] })
      toast(many ? `已加入 ${tracks.length} 首` : '已加入歌单', 'success')
      onClose()
    } else {
      toast(r.error.message, 'error')
    }
  }

  return (
    <Modal open onClose={onClose} title={many ? `加入 ${tracks.length} 首到歌单` : '加入歌单'} width={420}>
      {local.length === 0 ? (
        <p className="py-4 text-center text-sm text-[var(--color-text-secondary)]">暂无本地歌单，请先在「播放列表」页创建</p>
      ) : (
        <div className="flex flex-col gap-1">
          {local.map((p) => (
            <Button key={p.id} variant="secondary" onClick={() => void add(p.id)}>
              {p.name}（{p.trackCount}）
            </Button>
          ))}
        </div>
      )}
    </Modal>
  )
}
