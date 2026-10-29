// 播放列表页：本地歌单 CRUD / 收藏夹 / 订阅合集 / 外部歌单导入
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ImportResult, Playlist, PlaylistType } from '@shared/types'
import { queryClient, useAuthState, usePlaylistTracks, usePlaylists } from '@renderer/api/client'
import { TrackList } from '@renderer/components/TrackList'
import { Button, Modal, Spinner, toast } from '@renderer/components/ui'
import { IconClose } from '@renderer/components/icons'

const TYPE_LABELS: Record<PlaylistType, string> = {
  local: '本地',
  favorite: '收藏夹',
  subscription: '订阅',
  imported: '导入',
}

export function PlaylistPage() {
  const { data: playlists = [], isLoading } = usePlaylists()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [importOpen, setImportOpen] = useState(false)

  const selected = playlists.find((p) => p.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedId && playlists.length > 0) setSelectedId(playlists[0].id)
  }, [playlists, selectedId])

  const createLocal = async (): Promise<void> => {
    const name = newName.trim()
    if (!name) {
      toast('请输入歌单名称', 'error')
      return
    }
    const r = await window.api.library.create(name, 'local')
    if (r.ok) {
      setNewName('')
      await queryClient.invalidateQueries({ queryKey: ['playlists'] })
      setSelectedId(r.data.id)
    } else {
      toast(r.error.message, 'error')
    }
  }

  const remove = async (p: Playlist): Promise<void> => {
    const r = await window.api.library.delete(p.id)
    if (r.ok) {
      await queryClient.invalidateQueries({ queryKey: ['playlists'] })
      if (selectedId === p.id) setSelectedId(null)
    } else {
      toast(r.error.message, 'error')
    }
  }

  return (
    <div className="flex h-full">
      {/* 左侧歌单列表 */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-black/5 p-3 dark:border-white/10">
        <div className="mb-3 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void createLocal()}
            placeholder="新建本地歌单"
            className="min-w-0 flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] dark:border-white/15"
          />
          <Button onClick={() => void createLocal()}>新建</Button>
        </div>

        <div className="mb-2 flex flex-wrap gap-1">
          <SyncFavorites />
          <SyncSubscriptions />
        </div>

        <Button variant="secondary" onClick={() => setImportOpen(true)}>
          导入外部歌单
        </Button>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : (
            playlists.map((p) => (
              <div
                key={p.id}
                className={`group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  p.id === selectedId ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]' : 'hover:bg-black/5 dark:hover:bg-white/5'
                }`}
                onClick={() => setSelectedId(p.id)}
              >
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="shrink-0 text-xs text-[var(--color-text-secondary)]">{p.trackCount}</span>
                {p.type === 'local' && (
                  <button
                    className="shrink-0 p-1 opacity-0 hover:text-red-500 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      void remove(p)
                    }}
                  >
                    <IconClose size={14} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* 右侧曲目（不用 <main>：页面栈里 App 已有一个 main，嵌套 main 是无效 HTML） */}
      <section className="min-w-0 flex-1 overflow-y-auto p-4">
        {selected ? (
          <>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-base font-semibold">{selected.name}</h2>
              <span className="rounded bg-black/5 px-2 py-0.5 text-xs text-[var(--color-text-secondary)] dark:bg-white/10">
                {TYPE_LABELS[selected.type]}
              </span>
            </div>
            <PlaylistTracks playlistId={selected.id} />
          </>
        ) : (
          <div className="py-16 text-center text-sm text-[var(--color-text-secondary)]">
            选择或新建一个歌单
          </div>
        )}
      </section>

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </div>
  )
}

function PlaylistTracks({ playlistId }: { playlistId: string }) {
  const { data: tracks = [], isLoading } = usePlaylistTracks(playlistId)

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  return (
    <TrackList
      tracks={tracks}
      emptyText="歌单为空"
      removable
      onRemove={async (trackId) => {
        const r = await window.api.library.removeTrack(playlistId, trackId)
        if (r.ok) {
          await queryClient.invalidateQueries({ queryKey: ['playlist-tracks', playlistId] })
          await queryClient.invalidateQueries({ queryKey: ['playlists'] })
        } else {
          toast(r.error.message, 'error')
        }
      }}
    />
  )
}

function SyncFavorites() {
  const { data: auth } = useAuthState()
  const [loading, setLoading] = useState(false)

  const sync = async (): Promise<void> => {
    if (!auth?.isLoggedIn) {
      toast('请先登录 B 站', 'error')
      return
    }
    setLoading(true)
    const r = await window.api.bili.favorites()
    setLoading(false)
    if (!r.ok) {
      toast(r.error.message, 'error')
      return
    }
    const folder = r.data.folders[0]
    const pl = await window.api.library.create(folder?.title ?? '收藏夹', 'favorite', folder ? String(folder.id) : undefined)
    if (pl.ok) {
      await window.api.library.addTracks(pl.data.id, r.data.items)
      await queryClient.invalidateQueries({ queryKey: ['playlists'] })
      toast(`已同步 ${r.data.items.length} 首到收藏夹歌单`, 'success')
    }
  }

  return (
    <Button variant="secondary" onClick={() => void sync()} disabled={loading}>
      {loading ? '同步中' : '同步收藏夹'}
    </Button>
  )
}

function SyncSubscriptions() {
  const { data: auth } = useAuthState()
  const [loading, setLoading] = useState(false)

  const sync = async (): Promise<void> => {
    if (!auth?.isLoggedIn) {
      toast('请先登录 B 站', 'error')
      return
    }
    setLoading(true)
    const r = await window.api.bili.subscriptions()
    setLoading(false)
    if (!r.ok) {
      toast(r.error.message, 'error')
      return
    }
    const pl = await window.api.library.create('订阅合集', 'subscription')
    if (pl.ok) {
      await window.api.library.addTracks(pl.data.id, r.data)
      await queryClient.invalidateQueries({ queryKey: ['playlists'] })
      toast(`已同步 ${r.data.length} 首到订阅合集`, 'success')
    }
  }

  return (
    <Button variant="secondary" onClick={() => void sync()} disabled={loading}>
      {loading ? '同步中' : '同步订阅'}
    </Button>
  )
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [source, setSource] = useState<'netease' | 'qq'>('netease')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const runImport = async (): Promise<void> => {
    if (!url.trim()) {
      toast('请输入歌单链接', 'error')
      return
    }
    if (!confirmed) {
      toast(t('import.confirmLabel'), 'error')
      return
    }
    setLoading(true)
    const r = await window.api.importer.import(source, url.trim())
    setLoading(false)
    if (r.ok) setResult(r.data)
    else toast(r.error.message, 'error')
  }

  const save = async (): Promise<void> => {
    if (!result) return
    setSaving(true)
    const pl = await window.api.library.create(`${source === 'netease' ? '网易云' : 'QQ'}导入歌单`, 'imported')
    if (pl.ok) {
      await window.api.library.addTracks(pl.data.id, result.matched)
      await queryClient.invalidateQueries({ queryKey: ['playlists'] })
      toast(`已保存 ${result.matched.length} 首（跳过 ${result.unmatched.length} 首失效项）`, 'success')
      onClose()
    }
    setSaving(false)
  }

  return (
    <Modal open onClose={onClose} title="导入外部歌单" width={520}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as 'netease' | 'qq')}
            className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-[var(--color-text-primary)] dark:border-white/15"
          >
            <option value="netease" className="text-black">网易云音乐</option>
            <option value="qq" className="text-black">QQ 音乐</option>
          </select>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="粘贴歌单链接"
            className="min-w-0 flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] dark:border-white/15"
          />
          <Button onClick={() => void runImport()} disabled={loading || !confirmed}>
            {loading ? '解析中' : '解析'}
          </Button>
        </div>

        <label className="flex cursor-pointer items-start gap-2 text-xs text-[var(--color-text-secondary)]">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5"
          />
          <span>{t('import.disclaimer')}</span>
        </label>

        {loading && (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        )}

        {result && (
          <div className="rounded-lg bg-black/5 p-3 text-sm dark:bg-white/5">
            <div className="mb-2">
              共 {result.total} 首，匹配 {result.matched.length} 首，未匹配 {result.unmatched.length} 首
            </div>
            {result.unmatched.length > 0 && (
              <div className="max-h-32 overflow-y-auto text-xs text-[var(--color-text-secondary)]">
                {result.unmatched.map((u, i) => (
                  <div key={i} className="line-clamp-1">
                    ✗ {u.title} - {u.artist}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex justify-end">
              <Button onClick={() => void save()} disabled={saving || result.matched.length === 0}>
                {saving ? '保存中' : `保存 ${result.matched.length} 首`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
