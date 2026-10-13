// 播放队列面板：点击切歌 / 移除 / 上下移动 / 清空
import { engine } from '@renderer/audio/audio-engine'
import { usePlayerStore } from '@renderer/store/player-store'
import { formatTime, toast } from './ui'
import { IconClose } from './icons'

export function QueuePanel() {
  const queue = usePlayerStore((s) => s.queue)
  const queueIndex = usePlayerStore((s) => s.queueIndex)
  const currentTrack = usePlayerStore((s) => s.currentTrack)

  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue)
  const moveInQueue = usePlayerStore((s) => s.moveInQueue)
  const clearQueue = usePlayerStore((s) => s.clearQueue)

  const playAt = (index: number): void => {
    const t = queue[index]
    if (!t) return
    void engine.playTrack(t, queue, index).catch((e) => {
      toast(e instanceof Error ? e.message : '播放失败，请重试', 'error')
    })
  }

  if (queue.length === 0) {
    return <div className="py-10 text-center text-sm text-[var(--color-text-secondary)]">播放队列为空</div>
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-black/5 px-4 py-2 dark:border-white/10">
        <span className="text-sm font-medium">播放队列（{queue.length}）</span>
        <button className="text-xs text-[var(--color-text-secondary)] hover:text-red-500" onClick={clearQueue}>
          清空
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {queue.map((t, i) => {
          const isCurrent = i === queueIndex || currentTrack?.id === t.id
          return (
            <div
              key={`${t.id}_${i}`}
              className={`group flex items-center gap-2 px-3 py-2 text-sm ${
                isCurrent ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]' : ''
              }`}
            >
              <button className="w-8 shrink-0 text-center" onClick={() => playAt(i)}>
                {isCurrent ? '♪' : i + 1}
              </button>
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => playAt(i)}>
                <div className="line-clamp-1">{t.title}</div>
                <div className="line-clamp-1 text-xs text-[var(--color-text-secondary)]">{t.artist}</div>
              </div>
              <span className="shrink-0 text-xs text-[var(--color-text-secondary)]">{formatTime(t.duration)}</span>
              <button
                className="shrink-0 px-1 text-xs opacity-0 hover:text-[var(--color-accent)] group-hover:opacity-100"
                onClick={() => moveInQueue(i, -1)}
                title="上移"
              >
                ↑
              </button>
              <button
                className="shrink-0 px-1 text-xs opacity-0 hover:text-[var(--color-accent)] group-hover:opacity-100"
                onClick={() => moveInQueue(i, 1)}
                title="下移"
              >
                ↓
              </button>
              <button
                className="shrink-0 px-1 opacity-0 hover:text-red-500 group-hover:opacity-100"
                onClick={() => removeFromQueue(i)}
                title="移除"
              >
                <IconClose size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
