// B 站各 API 函数：搜索 / 视频信息 / 播放地址 / 收藏夹 / 订阅合集
import { BILI_API_BASE, BILI_PASSPORT_BASE } from '../../shared/constants'
import type {
  FavoriteData,
  FavoriteFolder,
  PlayUrlResult,
  QrCodeData,
  SearchResult,
  Track,
  VideoInfo,
} from '../../shared/types'
import type { Buvid3Manager } from './buvid3'
import type { HttpClient } from './http-client'
import type { UrlResolver } from './url-resolver'
import { toHttps } from '../../shared/security'
import { stripHtml } from '../../shared/text'
import { createTraceId, logDebug, logWarn } from '../logger'

interface ViewResponse {
  bvid?: string
  aid?: number
  cid?: number
  title?: string
  pic?: string
  duration?: number
  owner?: { name?: string; face?: string }
  pages?: { cid?: number; part?: string; duration?: number }[]
}

interface SearchResponse {
  numResults?: number
  result?: {
    bvid?: string
    aid?: number
    title?: string
    author?: string
    pic?: string
    duration?: number | string
  }[]
}

interface PlayUrlResponse {
  dash?: {
    audio?: {
      baseUrl?: string
      base_url?: string
      /** 备用节点：B 站会同时下发多个 CDN 地址，mcdn 等 P2P 边缘节点不稳定时用得上 */
      backupUrl?: string[]
      backup_url?: string[]
    }[]
    duration?: number
  }
  durl?: { url?: string; backup_url?: string[]; length?: number }[]
  timelength?: number
}

interface FavMedia {
  id?: number
  bvid?: string
  cid?: number
  title?: string
  cover?: string
  duration?: number
  upper?: { name?: string }
  pages?: { cid?: number }[]
}

interface SeriesArchive {
  bvid?: string
  cid?: number
  id?: number
  title?: string
  cover?: string
  duration?: number
  owner?: { name?: string }
}

export interface NavData {
  isLogin: boolean
  mid: number
  uname?: string
  face?: string
}

export function parseDuration(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') {
    const parts = v.split(':').map((s) => Number(s))
    if (parts.some((n) => Number.isNaN(n))) return 0
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  return 0
}

export class BiliApi {
  constructor(
    private readonly http: HttpClient,
    private readonly buvid3: Buvid3Manager,
    private readonly resolver: UrlResolver,
  ) {}

  private async ready(): Promise<void> {
    await this.buvid3.ensure()
  }

  async getNav(): Promise<NavData> {
    const data = await this.http.getRaw<{ code?: number; data?: { isLogin?: boolean; mid?: number; uname?: string; face?: string } }>(
      `${BILI_API_BASE}/x/web-interface/nav`,
    )
    const d = data?.data ?? {}
    return { isLogin: !!d.isLogin, mid: d.mid ?? 0, uname: d.uname, face: d.face }
  }

  async getVideoInfo(bvid: string): Promise<VideoInfo> {
    await this.ready()
    const data = await this.http.get<ViewResponse>(`${BILI_API_BASE}/x/web-interface/view`, { bvid })
    const firstPage = data.pages?.[0]
    return {
      bvid: data.bvid ?? bvid,
      aid: data.aid ?? 0,
      cid: data.cid ?? firstPage?.cid ?? 0,
      title: stripHtml(data.title ?? ''),
      coverUrl: toHttps(data.pic),
      duration: data.duration ?? 0,
      artist: stripHtml(data.owner?.name ?? '') || '未知 UP 主',
      pages: (data.pages ?? []).map((p) => ({
        cid: p.cid ?? 0,
        part: p.part ?? '',
        duration: p.duration ?? 0,
      })),
    }
  }

  async search(keyword: string, page = 1): Promise<SearchResult> {
    await this.ready()
    const data = await this.http.get<SearchResponse>(
      `${BILI_API_BASE}/x/web-interface/search/type`,
      { keyword, search_type: 'video', page, page_size: 20 },
      { wbi: true },
    )
    const list = data?.result ?? []
    const items: Track[] = list
      .filter((it) => !!it.bvid)
      .map((it) => ({
        id: `${it.bvid}_0`,
        bvid: it.bvid!,
        cid: 0,
        aid: it.aid,
        // 搜索接口把命中词包在 <em class="keyword"> 里，直接入库会污染界面与歌词匹配
        title: stripHtml(it.title ?? ''),
        artist: stripHtml(it.author ?? '') || '未知 UP 主',
        coverUrl: toHttps(it.pic),
        duration: parseDuration(it.duration),
        source: 'search' as const,
      }))
    const total = data?.numResults ?? items.length
    return { items, total, hasMore: page * 20 < total }
  }

  async getPlayUrl(bvid: string, cid: number): Promise<PlayUrlResult> {
    await this.ready()
    const traceId = createTraceId()
    logDebug('bili.api', '获取播放地址', { traceId, bvid, cid })
    const data = await this.http.get<PlayUrlResponse>(
      `${BILI_API_BASE}/x/player/playurl`,
      { bvid, cid, fnval: 16, fnver: 0, fourk: 1 },
      { wbi: true },
    )
    const audio = data?.dash?.audio?.[0]
    const audioUrl = audio?.baseUrl || audio?.base_url || data?.durl?.[0]?.url
    if (!audioUrl) throw new Error('未获取到可播放的音频流（可能需要登录或该视频无音频轨）')

    // 备用地址：B 站会同时给多个 CDN 节点（mcdn P2P 边缘节点经常 503/403），
    // 只取第一个时节点一抖就整首放不出来，所以把备用地址一并交给渲染层做失败切换。
    const backups = [
      ...(audio?.backupUrl ?? []),
      ...(audio?.backup_url ?? []),
      ...(data?.durl?.[0]?.backup_url ?? []),
    ]
    const backupUrls = [...new Set(backups.filter((u) => typeof u === 'string' && u && u !== audioUrl))]
    if (backupUrls.length > 0) {
      logDebug('bili.api', '含备用播放地址', { traceId, count: backupUrls.length })
    }

    const duration = data?.dash?.duration ?? data?.durl?.[0]?.length ?? data?.timelength ?? 0
    return { audioUrl, backupUrls, duration }
  }

  async resolve(input: string): Promise<{ bvid: string } | null> {
    return this.resolver.resolve(input)
  }

  async getQrCode(): Promise<QrCodeData> {
    const data = await this.http.getRaw<{ code?: number; message?: string; data?: { url?: string; qrcode_key?: string } }>(
      `${BILI_PASSPORT_BASE}/x/passport-login/web/qrcode/generate`,
    )
    if (data?.code !== 0 || !data?.data?.url || !data?.data?.qrcode_key) {
      throw new Error(data?.message || '二维码生成失败')
    }
    return { url: data.data.url, qrcodeKey: data.data.qrcode_key }
  }

  async pollQrCodeRaw(qrcodeKey: string): Promise<{ code: number; message: string; cookies: string[] }> {
    const res = await this.http.requestFull<{ code?: number; message?: string }>({
      url: `${BILI_PASSPORT_BASE}/x/passport-login/web/qrcode/poll`,
      params: { qrcode_key: qrcodeKey },
    })
    return { code: res.data?.code ?? -1, message: res.data?.message ?? '', cookies: res.cookies }
  }

  async getFavorites(): Promise<FavoriteData> {
    await this.ready()
    const nav = await this.getNav()
    if (!nav.isLogin || !nav.mid) throw new Error('未登录，无法获取收藏夹')

    const folderData = await this.http.get<{ list?: { id?: number; title?: string; media_count?: number }[] }>(
      `${BILI_API_BASE}/x/v3/fav/folder/created/list-all`,
      { up_mid: nav.mid },
      { wbi: true },
    )
    const folders: FavoriteFolder[] = (folderData?.list ?? [])
      .filter((f) => f.id != null)
      .map((f) => ({ id: f.id!, title: f.title ?? '', mediaCount: f.media_count ?? 0 }))

    let items: Track[] = []
    const defaultFolder = folders[0]
    if (defaultFolder) {
      const mediaData = await this.http.get<{ medias?: FavMedia[] }>(
        `${BILI_API_BASE}/x/v3/fav/resource/list`,
        { media_id: defaultFolder.id, pn: 1, ps: 50, platform: 'web', order: 'mtime', type: 0, tid: 0 },
        { wbi: true },
      )
      items = (mediaData?.medias ?? [])
        .map((m) => this.favMediaToTrack(m, defaultFolder.id))
        .filter((t): t is Track => t !== null)
    }
    return { folders, items }
  }

  async getSubscriptions(): Promise<Track[]> {
    await this.ready()
    const nav = await this.getNav()
    if (!nav.isLogin || !nav.mid) throw new Error('未登录，无法获取订阅合集')

    const seriesData = await this.http.get<{ list?: { series_id?: number }[] }>(
      `${BILI_API_BASE}/x/series/seriesList`,
      { mid: nav.mid },
      { wbi: true },
    )
    const tracks: Track[] = []
    for (const s of (seriesData?.list ?? []).slice(0, 5)) {
      const sid = s?.series_id
      if (!sid) continue
      try {
        const arch = await this.http.get<{ archives?: SeriesArchive[] }>(
          `${BILI_API_BASE}/x/series/archives`,
          { mid: nav.mid, series_id: sid, pn: 1, ps: 30 },
          { wbi: true },
        )
        for (const a of arch?.archives ?? []) {
          if (a?.bvid) tracks.push(this.seriesArchiveToTrack(a))
        }
      } catch (e) {
        // 单个订阅合集的子列表失败不拖垮整体：跳过该合集并告警；未登录/总列表失败仍正常抛出
        logWarn('bili.api', '获取订阅合集子列表失败，跳过该合集', {
          traceId: createTraceId(),
          seriesId: sid,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
    return tracks
  }

  private favMediaToTrack(m: FavMedia, mediaId: number): Track | null {
    if (!m?.bvid) return null
    const cid = m.pages?.[0]?.cid ?? m.cid ?? 0
    return {
      id: `${m.bvid}_${cid}`,
      bvid: m.bvid,
      cid,
      aid: m.id,
      title: stripHtml(m.title ?? ''),
      artist: stripHtml(m.upper?.name ?? '') || '未知 UP 主',
      coverUrl: toHttps(m.cover),
      duration: m.duration ?? 0,
      source: 'favorite',
      playlistId: `fav_${mediaId}`,
    }
  }

  private seriesArchiveToTrack(a: SeriesArchive): Track {
    const cid = a.cid ?? 0
    return {
      id: `${a.bvid}_${cid}`,
      bvid: a.bvid!,
      cid,
      aid: a.id,
      title: stripHtml(a.title ?? ''),
      artist: stripHtml(a.owner?.name ?? '') || '未知 UP 主',
      coverUrl: toHttps(a.cover),
      duration: a.duration ?? 0,
      source: 'subscription',
    }
  }
}
