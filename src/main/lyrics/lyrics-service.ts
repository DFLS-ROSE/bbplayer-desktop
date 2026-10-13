// 歌词自动匹配 / 搜索 / 抓取（QQ 音乐 / 酷狗；网易云版权少已移除）
// 匹配策略：标题清洗 + 多关键词降级 + 候选评分排序（歌名+歌手）+ 歌词内容校验
import { DEFAULT_UA } from '../../shared/constants'
import type { LyricCandidate, LyricFetchResult } from '../../shared/types'
import { fetchWithTimeout } from '../net/fetch-utils'
import { logWarn } from '../logger'

interface QqSearchResp {
  data?: { song?: { list?: { songmid?: string; songname?: string; singer?: { name?: string }[] }[] } }
}
interface QqLyricResp {
  lyric?: string
  trans?: string
}
interface KugouSearchResp {
  data?: { lists?: { FileHash?: string; SongName?: string; SingerName?: string }[] }
}
interface KugouKrcsResp {
  candidates?: { id?: string; accesskey?: string }[]
}
interface KugouDownloadResp {
  content?: string
}

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
    }

    // 按与目标标题/歌手的匹配度排序，最优在前
    const scored = candidates.map((c) => ({ c, s: scoreCandidate(c, title, artist) }))
    scored.sort((a, b) => b.s - a.s)
    return scored.map((x) => x.c)
  }

  async fetch(source: string, songId: string, title?: string): Promise<LyricFetchResult> {
    if (source === 'qq') {
      const data = await this.fetchJson<QqLyricResp>(
        'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg',
        { songmid: songId, format: 'json', nobase64: 1, g_tk: 5381 },
        { Referer: 'https://y.qq.com/' },
      )
      return { source, lrc: data?.lyric ?? '', translation: data?.trans ?? '' }
    }
    if (source === 'kugou') {
      // 新版歌词 API：krcs 搜索 → lyrics 下载（content 为 base64 LRC）
      const kw = title || songId
      const search = await this.fetchJson<KugouKrcsResp>(
        'https://krcs.kugou.com/search',
        { ver: 1, man: 'yes', client: 'mobi', keyword: kw, hash: songId },
        { Referer: 'https://www.kugou.com/' },
      )
      const cand = search?.candidates?.[0]
      if (!cand?.id || !cand?.accesskey) return { source, lrc: '' }
      const dl = await this.fetchJson<KugouDownloadResp>(
        'https://lyrics.kugou.com/download',
        { ver: 1, client: 'pc', id: cand.id, accesskey: cand.accesskey, fmt: 'lrc', charset: 'utf8' },
        { Referer: 'https://www.kugou.com/' },
      )
      const lrc = dl?.content ? Buffer.from(dl.content, 'base64').toString('utf8') : ''
      return { source, lrc }
    }
    throw new Error(`未知歌词源：${source}`)
  }

  /** 两个源搜索一次（返回未排序候选）；仅用标题搜索，避免把 UP 主名拼进关键词污染匹配 */
  private async searchOnce(title: string): Promise<LyricCandidate[]> {
    const kw = title
    const candidates: LyricCandidate[] = []

    // QQ 音乐
    try {
      const data = await this.fetchJson<QqSearchResp>(
        'https://c.y.qq.com/soso/fcgi-bin/client_search_cp',
        { format: 'json', w: kw, n: 10, t: 0 },
        { Referer: 'https://y.qq.com/' },
      )
      for (const s of data?.data?.song?.list ?? []) {
        candidates.push({
          source: 'qq',
          songId: s.songmid ?? '',
          title: s.songname ?? '',
          artist: (s.singer ?? []).map((a) => a.name ?? '').filter(Boolean).join('/'),
        })
      }
    } catch (e) {
      logWarn('lyrics', 'QQ 音乐搜索失败', { error: e instanceof Error ? e.message : String(e) })
    }

    // 酷狗
    try {
      const data = await this.fetchJson<KugouSearchResp>(
        'https://songsearch.kugou.com/song_search_v2',
        { keyword: kw, page: 1, pagesize: 10 },
        { Referer: 'https://www.kugou.com/' },
      )
      for (const s of data?.data?.lists ?? []) {
        candidates.push({
          source: 'kugou',
          songId: s.FileHash ?? '',
          title: s.SongName ?? '',
          artist: s.SingerName ?? '',
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

// ============ 标题清洗 / 匹配度评分 ============

/** 清洗 B 站标题：去括号/书名号/分辨率/常见视频修饰词，分隔符归一为空格（保留歌名+歌手核心） */
export function cleanTitle(title: string): string {
  return title
    .replace(/[【\[〔（(].*?[】\]〕）)]/g, ' ')
    .replace(/[《》「」『』"'`]/g, ' ')
    .replace(/\b\d{3,4}[pP]\b/g, ' ')
    .replace(
      /60fps|30fps|4k|8k|修复|纯享|现场|完整版|超清|高清|无损|官方|合集|翻唱|cover|live|remix|伴奏|纯音乐|演唱会|神级|经典|珍藏|原版|音乐现场|舞蹈|练习室|舞台|纯人声|消音|remaster|mv|op|ed|主题曲/gi,
      ' ',
    )
    .replace(/[-—–|/·_、,，～~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 归一化：小写 + 去空格标点符号 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-—–|/·_、,，。.!！?？"'《》「」【】()（）[\]{}]/g, '')
}

/** 清洗候选标题的版本/演唱标记："夜曲 - A35"、"夜曲 (DJ版)" → "夜曲" */
function cleanCandidateTitle(t: string): string {
  return t
    .replace(/[-—–|/].*$/, '')
    .replace(/[（(【\[〔].*?[）)】\]〕]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 字符重叠比例（0..1） */
function overlapScore(a: string, b: string): number {
  if (!a || !b) return 0
  const set = new Set(a)
  let common = 0
  for (const ch of b) if (set.has(ch)) common++
  return common / Math.max(a.length, b.length)
}

/** 候选匹配度评分：歌名匹配（清洗版本标记）+ 歌手匹配 - 变体惩罚 */
export function scoreCandidate(c: { title: string; artist: string }, title: string, artist?: string): number {
  const ct = normalize(cleanCandidateTitle(c.title))
  const tt = normalize(cleanTitle(title))
  let score = 0
  if (ct && tt) {
    if (ct === tt) score += 100
    else if (tt.includes(ct) || ct.includes(tt)) score += 70
    else score += Math.round(overlapScore(ct, tt) * 40)
  }
  // 歌手匹配：候选 artist 出现在目标标题里（标题含歌手名，如"周杰伦 夜曲"）
  const ca = normalize(c.artist)
  if (ca && tt && ca !== ct && tt.includes(ca)) score += 40
  // artist 参数（UP 主名）匹配
  if (artist) {
    const ua = normalize(artist)
    if (ca && ua && (ca.includes(ua) || ua.includes(ca))) score += 40
  }
  // 翻唱/现场/纯音乐等变体降权
  if (/(深情版|live|cover|remix|伴奏|纯音乐|翻唱|dj|现场|演唱会|合唱|电音|改编|口琴|钢琴|吉他|卡祖笛|电台)/i.test(c.title)) {
    score -= 25
  }
  return score
}

/** 生成多组搜索关键词（原始标题 → 清洗后标题）；artist（UP 主名）只用于评分，不参与搜索 */
function buildKeywordSets(title: string): string[] {
  const sets: string[] = [title]
  const cleaned = cleanTitle(title)
  if (cleaned && cleaned !== title) {
    sets.push(cleaned)
  }
  return sets
}

/** 判定抓取的歌词是否为有效 LRC（非空且含时间标签） */
export function isValidLyric(lrc: string): boolean {
  return !!lrc && /\[\d{1,3}:\d{1,2}/.test(lrc)
}
