// 可插拔外部歌单导入器：接口 + 注册表 + 模糊匹配到 B 站视频
import type { BiliApi } from '../bilibili/api'
import type { ImportResult, ImportTrackItem, Track } from '../../shared/types'
import { BILI_CONCURRENCY } from '../../shared/constants'
import { mapLimit } from '../net/rate-limiter'
import { logWarn } from '../logger'
import { NeteaseImporter } from './netease'
import { QqImporter } from './qq'

export interface Importer {
  readonly source: 'netease' | 'qq'
  parsePlaylist(url: string): Promise<ImportTrackItem[]>
}

export type MatchFn = (title: string, artist: string) => Promise<Track | null>

export class ImporterRegistry {
  private map: Map<string, Importer>

  constructor(
    importers: Importer[],
    private readonly api: BiliApi,
  ) {
    this.map = new Map(importers.map((i) => [i.source, i]))
  }

  async import(source: 'netease' | 'qq', url: string): Promise<ImportResult> {
    const importer = this.map.get(source)
    if (!importer) throw new Error(`不支持的导入源：${source}`)
    const items = await importer.parsePlaylist(url)
    if (items.length === 0) throw new Error('未能解析出歌曲，请检查链接或网络')

    const matched: Track[] = []
    const unmatched: ImportTrackItem[] = []
    // 分片并发匹配（每域并发受控，避免逐条串行）
    const results = await mapLimit(items, BILI_CONCURRENCY, async (item) => {
      const track = await this.matchOne(item)
      return { track, item }
    })
    for (const r of results) {
      if (r.track) matched.push(r.track)
      else unmatched.push(r.item)
    }
    return { source, total: items.length, matched, unmatched }
  }

  private async matchOne(item: ImportTrackItem): Promise<Track | null> {
    const queries = [item.title, `${item.title} ${item.artist}`]
    for (const kw of queries) {
      try {
        const res = await this.api.search(kw, 1)
        const best = this.pickBest(item, res.items)
        if (best) return best
      } catch (e) {
        logWarn('importer', '搜索匹配失败', { error: e instanceof Error ? e.message : String(e) })
      }
    }
    return null
  }

  private pickBest(item: ImportTrackItem, items: Track[]): Track | null {
    if (items.length === 0) return null
    const titleNorm = normalize(item.title)
    let best: Track | null = null
    let bestScore = 0
    for (const t of items) {
      const tNorm = normalize(t.title)
      let score = 0
      if (tNorm === titleNorm) score = 100
      else if (tNorm.includes(titleNorm) || titleNorm.includes(tNorm)) score = 60
      else {
        const a = new Set(tNorm.split(/\s+/).filter(Boolean))
        const b = new Set(titleNorm.split(/\s+/).filter(Boolean))
        let overlap = 0
        for (const w of a) if (b.has(w)) overlap++
        score = overlap * 10
      }
      if (item.artist && t.artist && t.artist.includes(item.artist)) score += 20
      if (score > bestScore) {
        bestScore = score
        best = t
      }
    }
    return bestScore >= 40 ? best : null
  }
}

export function createImporterRegistry(api: BiliApi): ImporterRegistry {
  return new ImporterRegistry([new NeteaseImporter(), new QqImporter()], api)
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[【】[\]()（）·\s]+/g, '').trim()
}
