// 下载页：已下载的音频 + 下载中的任务
import { useMemo, useState } from 'react'
import type { DownloadRecord, DownloadTask, Track } from '@shared/types'
import { useDownloads } from '@renderer/api/client'
import { engine } from '@renderer/audio/audio-engine'
import { usePlayerStore } from '@renderer/store/player-store'
import { Button, Spinner, formatTime, toast } from '@renderer/components/ui'
import { IconClose, IconPause, IconPlay } from '@renderer/components/icons'

/** 字节数格式化 */
function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  const mb = bytes / 1024 / 1024
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  return `${mb.toFixed(1)} MB`
}

/** 把下载记录转成可播放的 Track（走本地文件源） */
function recordToTrack(rec: DownloadRecord): Track {
  return {
    id: rec.trackId,
    bvid: rec.bvid,
    cid: rec.cid,
    title: rec.title,
    artist: rec.artist,
    coverUrl: rec.coverUrl,
    duration: rec.duration,
    source: 'local',
    localFileId: rec.trackId,
  }
}

export function DownloadsPage() {
  const { tasks, records, downloading, remove: removeDownload } = useDownloads()
  const [busyId, setBusyId] = useState<string | null>(null)

  const active = useMemo(() => tasks.filter((t) => t.status === 'downloading'), [tasks])
  const failed = useMemo(() => tasks.filter((t) => t.status === 'error'), [tasks])

  const play = (rec: DownloadRecord): void => {
    const track = recordToTrack(rec)
    void engine.playTrack(track, [track], 0)
  }

  const remove = async (rec: DownloadRecord): Promise<void> => {
    setBusyId(rec.trackId)
    const r = await removeDownload(rec.trackId)
    setBusyId(null)
    if (r.ok) toast('已删除下载文件', 'success')
    else toast(r.error.message, 'error')
  }

  const openFolder = async (): Promise<void> => {
    const r = await window.api.download.openFolder()
    if (!r.ok) toast(r.error.message, 'error')
  }

  return (
    <div className="mx-auto h-full max-w-4xl overflow-y-auto overflow-x-hidden px-6 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">下载</h1>
        <Button variant="secondary" onClick={() => void openFolder()}>
          打开下载目录
        </Button>
      </div>

      {/* 下载中的任务 */}
      {active.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-base font-semibold">下载中</h2>
          <div className="flex flex-col gap-2">
            {active.map((t) => (
              <DownloadingRow key={t.trackId} task={t} />
            ))}
          </div>
        </section>
      )}

      {/* 失败的任务 */}
      {failed.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-base font-semibold">下载失败</h2>
          <div className="flex flex-col gap-2">
            {failed.map((t) => (
              <div
                key={t.trackId}
                className="flex items-center gap-3 rounded-xl border border-black/5 px-3 py-2 dark:border-white/10"
              >
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-1 text-sm">{t.title}</div>
                  <div className="line-clamp-1 text-xs text-red-500">{t.error ?? '下载失败'}</div>
                </div>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void window.api.download.start({
                      id: t.trackId,
                      bvid: t.bvid,
                      cid: t.cid,
                      title: t.title,
                      artist: t.artist,
                      coverUrl: t.coverUrl,
                      duration: t.duration,
                      source: 'local',
                    } as Track)
                  }
                >
                  重试
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 已下载列表 */}
      <section>
        <h2 className="mb-2 text-base font-semibold">
          已下载{records.length > 0 && `（${records.length}）`}
        </h2>
        {records.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--color-text-secondary)]">
            还没有下载过音频
            <br />
            <span className="text-xs">在搜索结果或歌单里点下载按钮即可保存到本地</span>
          </div>
        ) : (
          <div className="flex flex-col">
            {records.map((rec) => (
              <DownloadedRow
                key={rec.trackId}
                rec={rec}
                busy={busyId === rec.trackId}
                downloading={downloading.has(rec.trackId)}
                onPlay={() => play(rec)}
                onRemove={() => void remove(rec)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function DownloadingRow({ task }: { task: DownloadTask }) {
  const pct = task.total > 0 ? Math.min(100, (task.received / task.total) * 100) : 0
  return (
    <div className="rounded-xl border border-black/5 px-3 py-2 dark:border-white/10">
      <div className="flex items-center gap-3">
        <Spinner />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-1 text-sm">{task.title}</div>
          <div className="text-xs text-[var(--color-text-secondary)]">
            {task.total > 0
              ? `${formatSize(task.received)} / ${formatSize(task.total)}`
              : formatSize(task.received)}
          </div>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-[var(--color-text-secondary)]">
          {pct.toFixed(0)}%
        </span>
        <button
          className="shrink-0 rounded p-1.5 text-[var(--color-text-secondary)] transition hover:bg-black/5 dark:hover:bg-white/10"
          onClick={() => void window.api.download.cancel(task.trackId)}
          title="取消下载"
        >
          <IconClose size={14} />
        </button>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
        <div
          className="h-full rounded-full bg-[var(--color-accent)] transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function DownloadedRow({
  rec,
  busy,
  downloading,
  onPlay,
  onRemove,
}: {
  rec: DownloadRecord
  busy: boolean
  downloading: boolean
  onPlay: () => void
  onRemove: () => void
}) {
  const currentId = usePlayerStore((s) => s.currentTrack?.id)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const isCurrent = currentId === rec.trackId

  return (
    <div className="group flex items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-black/5 dark:hover:bg-white/5">
      <button
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--color-accent)] hover:bg-[var(--color-accent-container)]"
        onClick={onPlay}
        aria-label="播放"
        disabled={downloading}
      >
        {isCurrent && isPlaying ? <IconPause size={16} /> : <IconPlay size={16} />}
      </button>
      <img
        src={rec.coverUrl}
        alt=""
        className="h-10 w-10 shrink-0 rounded-md object-cover"
        onError={(e) => {
          ;(e.target as HTMLImageElement).style.visibility = 'hidden'
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-1 text-sm">{rec.title}</div>
        <div className="line-clamp-1 text-xs text-[var(--color-text-secondary)]">
          {rec.artist}
          {rec.quality && ` · ${rec.quality}`}
          {` · ${formatSize(rec.fileSize)}`}
        </div>
      </div>
      <span className="shrink-0 text-xs tabular-nums text-[var(--color-text-secondary)]">
        {formatTime(rec.duration)}
      </span>
      <button
        className="shrink-0 rounded p-1.5 text-[var(--color-text-secondary)] opacity-0 transition hover:bg-black/5 group-hover:opacity-100 disabled:opacity-40"
        onClick={onRemove}
        disabled={busy}
        title="删除下载文件"
      >
        <IconClose size={14} />
      </button>
    </div>
  )
}
