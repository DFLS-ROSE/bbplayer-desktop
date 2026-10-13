// 主窗口歌词：自动匹配 / 手动搜索 / 粘贴 LRC / 偏移调整 / 联动悬浮窗
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { LyricCandidate, LyricData, LyricFetchResult, LyricLine } from '@shared/types'
import { usePlayerStore } from '@renderer/store/player-store'
import { findCurrentLineIndex, parseLyric } from '@renderer/lyrics/lyrics-parser'
import { Button, Modal, Spinner, toast } from './ui'

const SOURCE_LABELS: Record<string, string> = {
  netease: '网易云',
  qq: 'QQ音乐',
  kugou: '酷狗',
  manual: '手动粘贴',
}

export function LyricsView() {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const position = usePlayerStore((s) => s.position)

  const [lyricData, setLyricData] = useState<LyricData | null>(null)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [candidates, setCandidates] = useState<LyricCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const lastSentIndex = useRef(-1)

  /** 保存歌词到本地缓存（首次检索/手动切换后落库，下次播放直接复用） */
  const saveCache = (source: string, raw: LyricFetchResult): void => {
    if (!currentTrack) return
    void window.api.lyrics.saveCached({
      trackId: currentTrack.id,
      bvid: currentTrack.bvid,
      title: currentTrack.title,
      artist: currentTrack.artist,
      source,
      lrc: raw.lrc,
      translation: raw.translation,
      roman: raw.roman,
      updatedAt: Date.now(),
    })
  }

  // 切换曲目时自动匹配歌词
  useEffect(() => {
    let cancelled = false
    setLyricData(null)
    setOffset(0)
    if (!currentTrack) return
    void (async () => {
      setLoading(true)
      try {
        // 1. 优先读本地缓存（首次检索到后已落库，下次播放直接复用）
        const cached = await window.api.lyrics.getCached(currentTrack.id)
        if (cancelled) return
        if (cached.ok && cached.data?.lrc) {
          const parsed = parseLyric(cached.data.lrc, {
            translation: cached.data.translation,
            roman: cached.data.roman,
            source: cached.data.source,
          })
          if (parsed.lines.length > 0) {
            setLyricData(parsed)
            return
          }
        }
        // 2. 缓存未命中：搜索 + 抓取
        const search = await window.api.lyrics.search(currentTrack.title, currentTrack.artist)
        if (cancelled) return
        const candidates = search.ok ? search.data : []
        // 按评分顺序遍历候选，取第一个能解析出歌词行的（跳过翻唱/空歌词）
        for (const c of candidates.slice(0, 8)) {
          const r = await window.api.lyrics.fetch(c.source, c.songId, c.title)
          if (cancelled) return
          if (!r.ok) continue
          const parsed = parseLyric(r.data.lrc, {
            translation: r.data.translation,
            roman: r.data.roman,
            source: c.source,
          })
          if (parsed.lines.length > 0) {
            setLyricData(parsed)
            // 3. 首次检索到后保存缓存
            saveCache(c.source, r.data)
            return
          }
        }
      } catch (e) {
        void window.api.log({
          level: 'warn',
          scope: 'lyrics',
          message: '自动匹配失败',
          extra: { error: e instanceof Error ? e.message : String(e) },
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentTrack?.id])

  const lines = useMemo(() => lyricData?.lines ?? [], [lyricData])
  const currentIndex = useMemo(
    () => findCurrentLineIndex(lines, position + offset),
    [lines, position, offset],
  )

  // 当前行居中平滑滚动（Apple Music 风格）
  const activeLineRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [currentIndex])

  // 联动歌词悬浮窗
  useEffect(() => {
    const currentLine = currentIndex >= 0 ? lines[currentIndex] : null
    const nextLine = currentIndex + 1 < lines.length ? lines[currentIndex + 1] : null
    if (currentIndex === lastSentIndex.current) return
    lastSentIndex.current = currentIndex
    window.api.sendLyricsUpdate({
      track: currentTrack,
      currentLine,
      nextLine,
      index: currentIndex,
    })
  }, [currentIndex, lines, currentTrack])

  if (!currentTrack) {
    return <div className="py-10 text-center text-sm text-[var(--color-text-secondary)]">请先播放歌曲</div>
  }

  const adjustOffset = (delta: number): void => setOffset((o) => o + delta)

  const openSearch = async (): Promise<void> => {
    setSearchOpen(true)
    setSearching(true)
    const r = await window.api.lyrics.search(currentTrack.title, currentTrack.artist)
    setCandidates(r.ok ? r.data : [])
    setSearching(false)
  }

  const pickCandidate = async (c: LyricCandidate): Promise<void> => {
    const r = await window.api.lyrics.fetch(c.source, c.songId, c.title)
    if (!r.ok) {
      toast(r.error.message, 'error')
      return
    }
    applyRaw(r.data)
    saveCache(c.source, r.data)
    setSearchOpen(false)
  }

  const applyRaw = (raw: LyricFetchResult): void => {
    setLyricData(parseLyric(raw.lrc, { translation: raw.translation, roman: raw.roman, source: raw.source }))
    saveCache(raw.source, raw)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/5 px-4 py-2 dark:border-white/10">
        <span className="flex items-center gap-2 text-sm">
          <span className="font-medium">歌词</span>
          {lyricData && (
            <span className="text-xs text-[var(--color-text-secondary)]">
              来源：{SOURCE_LABELS[lyricData.source] ?? lyricData.source}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => adjustOffset(-0.5)}>偏移 -0.5s</Button>
          <Button variant="ghost" onClick={() => adjustOffset(0.5)}>偏移 +0.5s</Button>
          <Button variant="secondary" onClick={() => void openSearch()}>切换来源</Button>
          <Button variant="secondary" onClick={() => setPasteOpen(true)}>粘贴</Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : lines.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--color-text-secondary)]">
            未匹配到歌词，可手动搜索或粘贴 LRC
          </div>
        ) : (
          <div className="flex flex-col gap-2 py-[38vh]">
            {lines.map((line, i) => (
              <LyricLineRow
                key={i}
                line={line}
                active={i === currentIndex}
                lineRef={i === currentIndex ? activeLineRef : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* 手动搜索 */}
      <Modal open={searchOpen} onClose={() => setSearchOpen(false)} title="搜索歌词" width={480}>
        {searching ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : candidates.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--color-text-secondary)]">未找到候选歌词</p>
        ) : (
          <div className="flex flex-col gap-1">
            {candidates.map((c, i) => (
              <button
                key={`${c.source}_${c.songId}_${i}`}
                className="rounded-lg px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                onClick={() => void pickCandidate(c)}
              >
                <div className="line-clamp-1">{c.title}</div>
                <div className="text-xs text-[var(--color-text-secondary)]">
                  {c.artist} · {c.source}
                </div>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* 粘贴 LRC */}
      <PasteLrcModal open={pasteOpen} onClose={() => setPasteOpen(false)} onApply={applyRaw} />
    </div>
  )
}

function LyricLineRow({
  line,
  active,
  lineRef,
}: {
  line: LyricLine
  active: boolean
  lineRef?: RefObject<HTMLDivElement>
}) {
  return (
    <div
      ref={lineRef}
      className={`transition-all duration-500 ${
        active
          ? 'text-lg font-semibold text-[var(--color-accent)]'
          : 'text-sm text-[var(--color-text-secondary)] opacity-55'
      }`}
    >
      <div>{line.text || '♪'}</div>
      {active && line.translation && (
        <div className="mt-1 text-sm text-[var(--color-text-secondary)]">{line.translation}</div>
      )}
      {active && line.roman && (
        <div className="text-sm text-[var(--color-text-secondary)]">{line.roman}</div>
      )}
    </div>
  )
}

function PasteLrcModal(props: {
  open: boolean
  onClose: () => void
  onApply: (raw: LyricFetchResult) => void
}) {
  const { open, onClose, onApply } = props
  const [text, setText] = useState('')
  const [translation, setTranslation] = useState('')
  return (
    <Modal open={open} onClose={onClose} title="粘贴 LRC 歌词" width={560}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="粘贴 LRC 歌词文本 [00:12.00]歌词"
        className="h-48 w-full rounded-lg border border-black/10 bg-transparent p-3 text-sm outline-none focus:border-[var(--color-accent)] dark:border-white/15"
      />
      <textarea
        value={translation}
        onChange={(e) => setTranslation(e.target.value)}
        placeholder="（可选）粘贴翻译歌词"
        className="mt-2 h-24 w-full rounded-lg border border-black/10 bg-transparent p-3 text-sm outline-none focus:border-[var(--color-accent)] dark:border-white/15"
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>取消</Button>
        <Button
          onClick={() => {
            if (!text.trim()) return
            onApply({ source: 'manual', lrc: text, translation: translation || undefined })
            onClose()
          }}
        >
          应用
        </Button>
      </div>
    </Modal>
  )
}
