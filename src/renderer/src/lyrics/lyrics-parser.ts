// LRC / SPL 歌词解析：时间标签、逐字、翻译 / 罗马音
import type { LyricData, LyricLine, LyricWord } from '@shared/types'

const TAG_RE = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
const META_RE = /^\[[a-zA-Z]+:/

export interface ParseLyricOptions {
  translation?: string
  roman?: string
  source?: string
}

export function parseLyric(raw: string, opts: ParseLyricOptions = {}): LyricData {
  const source = opts.source ?? 'manual'
  const transMap = parseTaggedLines(opts.translation)
  const romanMap = parseTaggedLines(opts.roman)
  const hasWordTags = /<[^>]*\d{1,3}:\d{1,2}[^>]*>/.test(raw)
  const type = hasWordTags ? 'spl' : 'lrc'
  // 歌词全局时间偏移（酷狗等 [offset:毫秒] 元数据），换算为秒统一叠加到每个时间标签
  const offsetMatch = raw.match(/\[offset:\s*(-?\d+)\s*\]/i)
  const metaOffset = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0

  const lines: LyricLine[] = []
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || META_RE.test(line)) continue

    const timeTags = [...line.matchAll(TAG_RE)]
    if (timeTags.length === 0) continue

    let content = line.replace(TAG_RE, '').trim()
    const words = parseWords(content)
    if (words && words.length > 0) content = words.map((w) => w.text).join('')

    const baseTime = tagToSec(timeTags[0][0]) + metaOffset
    const lineObj: LyricLine = {
      time: baseTime,
      text: content,
      words: words && words.length > 0 ? words : undefined,
      roman: romanMap.get(baseTime),
      translation: transMap.get(baseTime),
    }
    lines.push(lineObj)

    // 一行多时间标签：为后续标签复制该行
    for (let i = 1; i < timeTags.length; i++) {
      lines.push({ ...lineObj, time: tagToSec(timeTags[i][0]) + metaOffset })
    }
  }

  lines.sort((a, b) => a.time - b.time)
  return { type, lines, offset: 0, source }
}

/** 依据播放时间（秒）查找当前行下标 */
export function findCurrentLineIndex(lines: LyricLine[], time: number): number {
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= time) idx = i
    else break
  }
  return idx
}

function parseTaggedLines(raw?: string): Map<number, string> {
  const map = new Map<number, string>()
  if (!raw) return map
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(TAG_RE)
    if (!m) continue
    const text = line.replace(TAG_RE, '').trim()
    if (text) map.set(tagToSec(m[0]), text)
  }
  return map
}

function parseWords(content: string): LyricWord[] | null {
  if (!/<[^>]+>/.test(content)) return null
  const words: LyricWord[] = []
  const re = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>([^<]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    words.push({ time: toSec(m[1], m[2], m[3]), text: m[4] ?? '' })
  }
  return words.length > 0 ? words : null
}

function tagToSec(tag: string): number {
  const m = tag.match(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/)
  if (!m) return 0
  return toSec(m[1], m[2], m[3])
}

function toSec(min: string, sec: string, frac?: string): number {
  const m = parseInt(min, 10) || 0
  const s = parseInt(sec, 10) || 0
  const f = frac ? parseInt(frac.padEnd(3, '0').slice(0, 3), 10) / 1000 : 0
  return m * 60 + s + f
}
