// 歌词自动匹配 / 搜索 / 抓取（酷狗；网易云版权少、QQ 搜索需签名均已移除）
// 匹配策略：标题清洗（多组关键词）→ 候选评分排序（歌名+歌手）→ 歌词本体校验（时间轴/歌名/占位歌词）
import { DEFAULT_UA } from '../../shared/constants'
import { charOverlap, normalizeTitle, stripHtml, stripVersionSuffix, titlesMatch } from '../../shared/text'
import type { LyricCandidate, LyricFetchResult } from '../../shared/types'
import { fetchWithTimeout } from '../net/fetch-utils'
import { logWarn } from '../logger'

interface KugouSearchResp {
  data?: {
    lists?: {
      FileHash?: string
      SongName?: string
      /** 原始歌名（"蔷薇青竹 (MV版)" → "蔷薇青竹"），评分时更可靠 */
      OriSongName?: string
      SingerName?: string
    }[]
  }
}
interface KugouKrcsResp {
  candidates?: KugouLyricCandidate[]
}
interface KugouLyricCandidate {
  id?: string
  accesskey?: string
  song?: string
  singer?: string
  duration?: number
  score?: number
  language?: string
}
interface KugouDownloadResp {
  content?: string
}

const KUGOU_HEADERS = { Referer: 'https://www.kugou.com/' }

export class LyricsService {
  async search(title: string, artist?: string): Promise<LyricCandidate[]> {
    const kwSets = buildKeywordSets(title)
    const seen = new Set<string>()
    const candidates: LyricCandidate[] = []

    for (const kw of kwSets) {
      const found = await this.searchOnce(kw)
      for (const c of found) {
        const key = `${c.source}:${c.songId}`
        if (seen.has(key)) continue
        seen.add(key)
        candidates.push(c)
      }
      // 已经出现「歌名完全一致」的候选就不再追加搜索，控制响应时延
      if (candidates.some((c) => scoreCandidate(c, title, artist) >= 100)) break
    }

    // 按与目标标题/歌手的匹配度排序，最优在前
    const scored = candidates.map((c) => ({ c, s: scoreCandidate(c, title, artist) }))
    scored.sort((a, b) => b.s - a.s)
    return scored.map((x) => x.c)
  }

  /**
   * 抓取指定候选的歌词。
   * title / artist 传「候选自己的歌名/歌手」，用于在酷狗返回的多条歌词里挑对的那条
   * （同一首歌常有原版、DJ 版、纯音乐占位等多条歌词）。
   */
  async fetch(
    source: string,
    songId: string,
    title?: string,
    artist?: string,
  ): Promise<LyricFetchResult> {
    if (source !== 'kugou') throw new Error(`未知歌词源：${source}`)

    const wanted = title ? stripVersionSuffix(title) : ''
    const lyricCandidates = await this.findLyricCandidates(songId, title, wanted)

    // 择优排序后逐个下载，校验通过即返回；酷狗常把「纯音乐/占位歌词」排在前面
    const ranked = lyricCandidates
      .filter((c) => !!c.id && !!c.accesskey)
      .map((c) => ({ c, s: rankLyricCandidate(c, wanted, artist) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 4)

    for (const { c } of ranked) {
      const lrc = await this.downloadKugouLyric(c)
      if (isUsableLyric(lrc, wanted)) return { source, lrc }
    }
    return { source, lrc: '' }
  }

  /** 依次尝试「hash 精确匹配 → hash+歌名 → 纯歌名」，返回合并去重后的歌词候选 */
  private async findLyricCandidates(
    songId: string,
    rawTitle: string | undefined,
    wantedTitle: string,
  ): Promise<KugouLyricCandidate[]> {
    const attempts: Record<string, string>[] = [{ hash: songId }]
    if (rawTitle) attempts.push({ hash: songId, keyword: rawTitle })
    if (wantedTitle && wantedTitle !== rawTitle) attempts.push({ keyword: wantedTitle })

    const out: KugouLyricCandidate[] = []
    const seen = new Set<string>()
    for (const params of attempts) {
      try {
        const resp = await this.fetchJson<KugouKrcsResp>('https://krcs.kugou.com/search', {
          ver: 1,
          man: 'yes',
          client: 'mobi',
          ...params,
        }, KUGOU_HEADERS)
        for (const c of resp?.candidates ?? []) {
          const key = `${c.id ?? ''}:${c.accesskey ?? ''}`
          if (!c.id || seen.has(key)) continue
          seen.add(key)
          out.push(c)
        }
      } catch (e) {
        logWarn('lyrics', '酷狗歌词候选查询失败', {
          error: e instanceof Error ? e.message : String(e),
          attempt: Object.keys(params).join('+'),
        })
      }
      if (out.length > 0) break // 上一层已有候选就不必继续放宽
    }
    return out
  }

  private async downloadKugouLyric(c: KugouLyricCandidate): Promise<string> {
    try {
      const dl = await this.fetchJson<KugouDownloadResp>(
        'https://lyrics.kugou.com/download',
        { ver: 1, client: 'pc', id: c.id ?? '', accesskey: c.accesskey ?? '', fmt: 'lrc', charset: 'utf8' },
        KUGOU_HEADERS,
      )
      return dl?.content ? Buffer.from(dl.content, 'base64').toString('utf8') : ''
    } catch (e) {
      logWarn('lyrics', '酷狗歌词下载失败', { error: e instanceof Error ? e.message : String(e) })
      return ''
    }
  }

  /** 酷狗搜索一次（返回未排序候选）；仅用标题搜索，避免把 UP 主名拼进关键词污染匹配 */
  private async searchOnce(title: string): Promise<LyricCandidate[]> {
    const kw = title
    const candidates: LyricCandidate[] = []

    // 酷狗
    try {
      const data = await this.fetchJson<KugouSearchResp>(
        'https://songsearch.kugou.com/song_search_v2',
        { keyword: kw, page: 1, pagesize: 10 },
        KUGOU_HEADERS,
      )
      for (const s of data?.data?.lists ?? []) {
        candidates.push({
          source: 'kugou',
          songId: s.FileHash ?? '',
          // OriSongName 是去掉 "(MV版)" 之类后缀的原始歌名，优先用作候选歌名
          title: stripHtml(s.OriSongName || s.SongName || ''),
          artist: stripHtml(s.SingerName ?? ''),
        })
      }
    } catch (e) {
      logWarn('lyrics', '酷狗搜索失败', { error: e instanceof Error ? e.message : String(e) })
    }

    return candidates
  }

  private async fetchJson<T>(
    url: string,
    params: Record<string, string | number>,
    headers?: Record<string, string>,
  ): Promise<T> {
    const u = new URL(url)
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v))
    const res = await fetchWithTimeout(u.toString(), {
      headers: { 'User-Agent': DEFAULT_UA, ...headers },
    })
    if (!res.ok) throw new Error(`歌词接口 HTTP ${res.status}`)
    return (await res.json()) as T
  }
}

// ============ 标题清洗 / 关键词生成 / 匹配度评分 ============

/** 括号类标记（含全角），里面通常是画质/音质/版本注释 */
const BRACKET_RE = /[【\[〔（(][^】\]〕）)]*[】\]〕）)]/g
/** 全角与半角的分隔符统一成空格 */
const SEPARATOR_RE = /[-—–|｜/／\\·・_、,，.。~～]+/g
/** 常见视频修饰词（不含歌名本身）：中文部分不限边界，拉丁单词要求词边界，避免误伤 stop/need 这类词 */
const NOISE_CN_RE =
  /修复|纯享|现场|完整版|超清|高清|无损|官方|合集|翻唱|伴奏|纯音乐|演唱会|神级|经典|珍藏|原版|音乐现场|舞蹈|练习室|舞台|纯人声|消音|主题曲|片尾曲|歌词|音质|耳机|录音棚|大声听|全网上线|全新|版/gi
const NOISE_EN_RE = /\b(?:60fps|30fps|4k|8k|hi-?res|remaster(?:ed)?|mv|op|ed|ost|cover|live|remix|inst)\b/gi

/** 清洗 B 站标题：去 HTML 标签/括号注释/分辨率/常见视频修饰词，分隔符归一为空格 */
export function cleanTitle(title: string): string {
  return stripHtml(title)
    .replace(BRACKET_RE, ' ')
    .replace(/[《》「」『』"'`]/g, ' ')
    .replace(/\b\d{3,4}[pP]\b/g, ' ')
    .replace(NOISE_EN_RE, ' ')
    .replace(NOISE_CN_RE, ' ')
    .replace(SEPARATOR_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 清洗候选标题的版本/演唱标记："夜曲 - A35"、"夜曲 (DJ版)" → "夜曲" */
function cleanCandidateTitle(t: string): string {
  return stripVersionSuffix(t)
}

/** 候选匹配度评分：歌名匹配（清洗版本标记）+ 歌手匹配 - 变体惩罚 */
export function scoreCandidate(c: { title: string; artist: string }, title: string, artist?: string): number {
  const ct = normalizeTitle(cleanCandidateTitle(c.title))
  const tt = normalizeTitle(cleanTitle(title))
  let score = 0
  if (ct && tt) {
    if (ct === tt) score += 100
    else if (tt.includes(ct)) score += 85 // 候选歌名被目标标题完整包含：最常见的好候选
    else if (ct.includes(tt)) score += 70
    else score += Math.round(charOverlap(ct, tt) * 40)
  }
  // 歌手匹配：候选 artist 出现在目标标题里（标题含歌手名，如"周杰伦 夜曲"）
  const ca = normalizeTitle(c.artist)
  if (ca && tt && ca !== ct && tt.includes(ca)) score += 40
  // artist 参数（B 站 UP 主名）匹配
  if (artist) {
    const ua = normalizeTitle(artist)
    if (ca && ua && (ca.includes(ua) || ua.includes(ca))) score += 40
  }
  // 翻唱/现场/纯音乐等变体降权
  if (/(深情版|live|cover|remix|伴奏|纯音乐|翻唱|dj|现场|演唱会|合唱|电音|改编|口琴|钢琴|吉他|卡祖笛|电台|inst)/i.test(c.title)) {
    score -= 25
  }
  return score
}

/**
 * 生成搜索关键词组（按优先级，最多 3 组）：
 * 1. 书名号/直角引号里的内容——B 站标题里这几乎总是干净的歌名（如《Lover》）
 * 2. 常规清洗后的标题
 * 3. 清洗后仍很长时取其前几个词（歌手 + 歌名通常在开头）
 * 影视剧/番剧名等"作品名"排除在外，避免搜到同名片头曲。
 */
export function buildKeywordSets(title: string): string[] {
  const raw = stripHtml(title)
  const sets: string[] = []
  const push = (s: string): void => {
    const t = s.replace(/\s+/g, ' ').trim()
    if (!t || !normalizeTitle(t)) return
    if (sets.some((x) => normalizeTitle(x) === normalizeTitle(t))) return
    sets.push(t)
  }

  for (const m of raw.matchAll(/[《「『]([^》」』]{1,20})[》」』]/g)) {
    const before = raw.slice(Math.max(0, (m.index ?? 0) - 6), m.index)
    if (/(影视剧|电视剧|电影|动画|番剧|动漫|游戏|专辑|小说|原作|广播剧)/.test(before)) continue
    push(m[1])
  }

  const cleaned = cleanTitle(raw)
  push(cleaned)

  if (cleaned.length > 12) {
    const head = cleaned.split(' ').slice(0, 3).join(' ')
    if (head.length >= 2) push(head)
  }

  return sets.slice(0, 3)
}

/** 判定抓取的歌词是否为有效 LRC（非空且含时间标签） */
export function isValidLyric(lrc: string): boolean {
  return !!lrc && /\[\d{1,3}:\d{1,2}/.test(lrc)
}

/** 酷狗占位歌词：无正文，只有 [ti:track1] 之类的占位元数据 */
function isPlaceholderLyric(lrc: string): boolean {
  const ti = lrc.match(/\[ti:([^\]]+)\]/i)?.[1]?.trim()
  if (!ti) return false
  if (/^track\d*$/i.test(ti)) return true
  // 只有元数据没有任何歌词行
  return !lrc.replace(/\[[a-z]+:[^\]]*\]/gi, '').replace(/\s/g, '')
}

/**
 * 歌词是否可用：含时间轴、不是占位歌词、[ti:] 与目标歌名不冲突。
 * wantTitle 传候选歌名（不要传冗长的 B 站视频标题）。
 */
export function isUsableLyric(lrc: string, wantTitle?: string): boolean {
  if (!isValidLyric(lrc)) return false
  if (isPlaceholderLyric(lrc)) return false
  const ti = lrc.match(/\[ti:([^\]]+)\]/i)?.[1]
  if (!ti || !wantTitle) return true
  return titlesMatch(stripVersionSuffix(ti), wantTitle, 0.5)
}

/** 歌词候选排序：歌名对得上 > 官方分高 > 非纯音乐 */
function rankLyricCandidate(
  c: KugouLyricCandidate,
  wantTitle: string,
  wantArtist?: string,
): number {
  let score = c.score ?? 0
  const song = stripVersionSuffix(c.song ?? '')
  if (wantTitle && song) {
    const same = normalizeTitle(song) === normalizeTitle(wantTitle)
    if (same) score += 60
    else if (titlesMatch(song, wantTitle, 0.5)) score += 30
    else score -= 40
  }
  if (wantArtist && c.singer) {
    const a = normalizeTitle(wantArtist)
    const b = normalizeTitle(c.singer)
    if (a && b && (a.includes(b) || b.includes(a))) score += 20
  }
  if (c.language === '纯音乐') score -= 50
  if (!c.duration) score -= 10
  return score
}
