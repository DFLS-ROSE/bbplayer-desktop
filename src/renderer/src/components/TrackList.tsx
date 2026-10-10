// 歌曲列表：点击播放 / 加入歌单
import { useState } from 'react'
import type { Track } from '@shared/types'
import { queryClient, usePlaylists } from '@renderer/api/client'
import { engine } from '@renderer/audio/audio-engine'
import { usePlayerStore } from '@renderer/store/player-store'
import { Button, Modal, formatTime, toast } from './ui'
import { IconClose, IconPause, IconPlay, IconPlus } from './icons'

interface Props {
  tracks: Track[]
  emptyText?: string
  onPlay?: (index: number) => void
  removable?: boolean
  onRemove?: (trackId: string) => void
}

export function TrackList({ tracks, emptyText = '暂无内容', onPlay, removable, onRemove }: Props) {
  const current = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const [addTarget, setAddTarget] = useState<Track | null>(null)

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

  return (
    <>
      <div className="flex flex-col">
        {tracks.map((t, i) => {
          const isCurrent = current?.id === t.id
          return (
            <div
              key={`${t.id}_${i}`}
              className={`group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-black/5 dark:hover:bg-white/5 ${
                isCurrent ? 'bg-[var(--color-accent)]/10' : ''
              }`}
              onDoubleClick={() => playAt(i)}
            >
              <button
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--color-accent)] hover:bg-[var(--color-accent-container)]"
                onClick={() => playAt(i)}
                aria-label="播放"
              >
                {isCurrent && isPlaying ? <IconPause size={16} /> : <IconPlay size={16} />}
              </button>
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
                <div className="line-clamp-1 text-xs text-[var(--color-text-secondary)]">{t.artist}</div>
              </div>
              <span className="shrink-0 text-xs text-[var(--color-text-secondary)]">{formatTime(t.duration)}</span>
              <button
                className="shrink-0 rounded p-1.5 text-[var(--color-text-secondary)] opacity-0 transition hover:bg-black/5 group-hover:opacity-100"
                onClick={() => setAddTarget(t)}
                title="加入歌单"
              >
                <IconPlus size={15} />
              </button>
              {removable && onRemove && (
                <button
                  className="shrink-0 rounded p-1.5 text-[var(--color-text-secondary)] opacity-0 transition hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                  onClick={() => onRemove(t.id)}
                  title="移除"
                >
                  <IconClose size={14} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {addTarget && <AddToPlaylistModal track={addTarget} onClose={() => setAddTarget(null)} />}
    </>
  )
}

function AddToPlaylistModal({ track, onClose }: { track: Track; onClose: () => void }) {
  const { data: playlists = [] } = usePlaylists()
  const local = playlists.filter((p) => p.type === 'local')

  const add = async (playlistId: string): Promise<void> => {
    const r = await window.api.library.addTracks(playlistId, [track])
    if (r.ok) {
      await queryClient.invalidateQueries({ queryKey: ['playlists'] })
      toast('已加入歌单', 'success')
      onClose()
    } else {
      toast(r.error.message, 'error')
    }
  }

  return (
    <Modal open onClose={onClose} title="加入歌单" width={420}>
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
