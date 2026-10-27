// 主窗口歌词：自动匹配 / 手动搜索 / 粘贴 LRC / 偏移调整（按 BV 号记忆）/ 联动悬浮窗
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { LyricCandidate, LyricData, LyricFetchResult, LyricLine } from '@shared/types'
import { usePlayerStore } from '@renderer/store/player-store'
import { findCurrentLineIndex, parseLyric } from '@renderer/lyrics/lyrics-parser'
import { hasAltVersionMark, normalizeTitle, stripVersionSuffix, titlesMatch } from '@shared/text'
import {
  OFFSET_COARSE,
  OFFSET_FINE,
  clampOffset,
  formatOffset,
  readOffsetTagSec,
  stripOffsetTag,
} from '@shared/lyrics-offset'
import { Button, Modal, Spinner, toast } from './ui'

const SOURCE_LABELS: Record<string, string> = {
  netease: '网易云',
  qq: 'QQ音乐',
  kugou: '酷狗',
  manual: '手动粘贴',
}

/** 调整后延迟落库，避免连点写入过多调整记录 */
const OFFSET_SAVE_DELAY = 400

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
  // 偏移防抖落库用：回调里要用「此刻」的曲目信息，不能依赖闭包里的旧值
  const trackRef = useRef(currentTrack)
  const offsetTimer = useRef<number | null>(null)
  useEffect(() => {
    trackRef.current = currentTrack
  }, [currentTrack])

  /** 保存歌词正文到本地缓存（偏移不再写进 LRC 文本，避免与库里的偏移叠加） */
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

  /** 设置偏移：界面立即生效，落库防抖（按 BV 号记忆，同一 BV 的分P共用） */
  const applyOffset = (nextSec: number): void => {
    const clamped = clampOffset(nextSec)
    setOffset(clamped)
    const t = trackRef.current
    if (!t) return
    if (offsetTimer.current != null) window.clearTimeout(offsetTimer.current)
    offsetTimer.current = window.setTimeout(() => {
      offsetTimer.current = null
      void window.api.lyrics.setOffset(t.bvid, t.title, Math.round(clamped * 1000))
    }, OFFSET_SAVE_DELAY)
  }

  /** 点击某行歌词：把它对齐到当前播放位置（比反复点 ±0.5 更快） */
  const alignToLine = (line: LyricLine): void => {
    const next = Math.round((line.time - position) * 10) / 10
    applyOffset(next)
    toast(`已对齐到「${line.text.slice(0, 12) || '此行'}」· 偏移 ${formatOffset(next)}`, 'success')
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
        // 0. 先取该 BV 记住的偏移（同一 BV 的不同分P共用，切歌不用再调）
        const savedOffset = await window.api.lyrics.getOffset(currentTrack.bvid)
        if (cancelled) return
        const storedSec = savedOffset.ok && savedOffset.data != null ? savedOffset.data / 1000 : null
        if (storedSec != null) setOffset(storedSec)

        // 1. 优先读本地缓存（首次检索到后已落库，下次播放直接复用）
        const cached = await window.api.lyrics.getCached(currentTrack.id)
        if (cancelled) return
        if (cached.ok && cached.data?.lrc) {
          // 缓存歌词同样校验歌名，旧版本缓存的错误歌词不再复用
          if (lyricMatchesTrack(cached.data.lrc, currentTrack.title, currentTrack.artist)) {
            // 旧版缓存的偏移写在 [offset:] 里：库里没有记录时迁移过来，随后统一剥掉标签
            const legacySec = readOffsetTagSec(cached.data.lrc)
            const effectiveSec = storedSec ?? (legacySec || 0)
            if (storedSec == null && legacySec !== 0) {
              setOffset(legacySec)
              void window.api.lyrics.setOffset(currentTrack.bvid, currentTrack.title, Math.round(legacySec * 1000))
            }
            const lrc = stripOffsetTag(cached.data.lrc)
            const parsed = parseLyric(lrc, {
              translation: cached.data.translation,
              roman: cached.data.roman,
              source: cached.data.source,
            })
            if (parsed.lines.length > 0) {
              setLyricData(parsed)
              if (effectiveSec !== 0) setOffset(effectiveSec)
              return
            }
          }
        }
        // 2. 缓存未命中：搜索 + 抓取
        const search = await window.api.lyrics.search(currentTrack.title, currentTrack.artist)
        if (cancelled) return
        const candidates = search.ok ? search.data : []
        // 按评分顺序遍历候选，取第一个能解析出歌词行的（跳过翻唱/空歌词）
        for (const c of candidates.slice(0, 8)) {
          // 候选歌名必须能在标题里对上，否则宁可不显示——
          // 「100 首精选合集」「演唱会全程」这类视频没有单一歌名，套上去只会串歌
          if (!titlesMatch(stripVersionSuffix(c.title), currentTrack.title)) continue
          const r = await window.api.lyrics.fetch(c.source, c.songId, c.title, c.artist)
          if (cancelled) return
          if (!r.ok) continue
          // 校验歌词本体歌名与实际曲目一致，防止串到别的歌
          if (!lyricMatchesTrack(r.data.lrc, currentTrack.title, currentTrack.artist)) continue
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

  // 卸载时把还没落库的偏移写掉
  useEffect(() => {
    return () => {
      if (offsetTimer.current != null) window.clearTimeout(offsetTimer.current)
    }
  }, [])

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

  const openSearch = async (): Promise<void> => {
    setSearchOpen(true)
    setSearching(true)
    const r = await window.api.lyrics.search(currentTrack.title, currentTrack.artist)
    setCandidates(r.ok ? r.data : [])
    setSearching(false)
  }

  const pickCandidate = async (c: LyricCandidate): Promise<void> => {
    const r = await window.api.lyrics.fetch(c.source, c.songId, c.title, c.artist)
    if (!r.ok) {
      toast(r.error.message, 'error')
      return
    }
    applyRaw(r.data)
    setSearchOpen(false)
  }

  const applyRaw = (raw: LyricFetchResult): void => {
    // 粘贴进来的 LRC 若自带 [offset:]：当前没有偏移记录时沿用它，并把标签剥掉（偏移统一由库里管）
    const legacySec = readOffsetTagSec(raw.lrc)
    if (legacySec !== 0 && offset === 0) applyOffset(legacySec)
    const clean: LyricFetchResult = { ...raw, lrc: stripOffsetTag(raw.lrc) }
    setLyricData(parseLyric(clean.lrc, { translation: clean.translation, roman: clean.roman, source: clean.source }))
    saveCache(clean.source, clean)
  }

  /** 校验歌词元数据 [ti:]（歌名）/ [ar:]（歌手）与目标是否匹配，避免串到同名/翻唱的歌 */
  const lyricMatchesTrack = (lrc: string, title: string, artist?: string): boolean => {
    const ti = lrc.match(/\[ti:([^\]]+)\]/i)?.[1]
    const ar = lrc.match(/\[ar:([^\]]+)\]/i)?.[1]

    // 歌名校验（有 [ti:] 时）：只对「歌词元数据」去掉版本标记，
    // B 站视频标题本身绝不能做截断式清洗——标题里的连字符会把有效内容整段砍掉。
    if (ti) {
      if (/^track\d*$/i.test(ti.trim())) return false // 酷狗占位歌词
      // 中文填词/翻唱/伴奏等属于另一份歌词正文，除非曲子本身就是翻唱
      if (hasAltVersionMark(ti) && !hasAltVersionMark(title)) return false
      if (!titlesMatch(stripVersionSuffix(ti), title)) return false
    }

    // 没有 [ti:] 时才用歌手兜底：歌词歌手名必须出现在标题或 UP 主名里
    if (ar && !ti) {
      const a = normalizeTitle(stripVersionSuffix(ar))
      const target = normalizeTitle(`${title} ${artist ?? ''}`)
      if (a && target && !target.includes(a)) return false
    }

    return true
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-black/5 px-4 py-2 dark:border-white/10">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <span className="shrink-0 font-medium">歌词</span>
          {lyricData && (
            <span className="truncate text-xs text-[var(--color-text-secondary)]">
              来源：{SOURCE_LABELS[lyricData.source] ?? lyricData.source}
            </span>
          )}
        </span>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            className="shrink-0 rounded-full bg-black/5 px-2 py-1 text-xs tabular-nums text-[var(--color-text-secondary)] dark:bg-white/10"
            title="当前偏移（正数＝歌词提前）。按 BV 号自动记住，下次播放同一视频无需再调"
          >
            偏移 {formatOffset(offset)}
          </span>
          <Button
            variant="ghost"
            className="px-2.5!"
            title={`歌词延后 ${OFFSET_COARSE} 秒`}
            onClick={() => applyOffset(offset - OFFSET_COARSE)}
          >
            -{OFFSET_COARSE}
          </Button>
          <Button
            variant="ghost"
            className="px-2.5!"
            title={`歌词延后 ${OFFSET_FINE} 秒`}
            onClick={() => applyOffset(offset - OFFSET_FINE)}
          >
            -{OFFSET_FINE}
          </Button>
          <Button
            variant="ghost"
            className="px-2.5!"
            title={`歌词提前 ${OFFSET_FINE} 秒`}
            onClick={() => applyOffset(offset + OFFSET_FINE)}
          >
            +{OFFSET_FINE}
          </Button>
          <Button
            variant="ghost"
            className="px-2.5!"
            title={`歌词提前 ${OFFSET_COARSE} 秒`}
            onClick={() => applyOffset(offset + OFFSET_COARSE)}
          >
            +{OFFSET_COARSE}
          </Button>
          <Button
            variant="ghost"
            className="px-2.5!"
            title="把偏移归零"
            disabled={offset === 0}
            onClick={() => applyOffset(0)}
          >
            归零
          </Button>
          <Button variant="secondary" className="px-2.5!" onClick={() => void openSearch()}>
            切换来源
          </Button>
          <Button variant="secondary" className="px-2.5!" onClick={() => setPasteOpen(true)}>
            粘贴
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4">
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
                onAlign={alignToLine}
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
  onAlign,
}: {
  line: LyricLine
  active: boolean
  lineRef?: RefObject<HTMLDivElement>
  onAlign?: (line: LyricLine) => void
}) {
  return (
    <div
      ref={lineRef}
      onClick={() => onAlign?.(line)}
      title={onAlign ? '点击：把这一行对齐到当前播放位置' : undefined}
      className={`cursor-pointer transition-all duration-500 ${
        active
          ? 'font-semibold text-[var(--color-accent)] text-[clamp(1rem,2.4vh,1.5rem)]'
          : 'text-[var(--color-text-secondary)] opacity-55 text-[clamp(0.8rem,2vh,1.2rem)]'
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
