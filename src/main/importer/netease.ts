// 网易云歌单导入：解析歌单 → 歌名 + 歌手列表
import { DEFAULT_UA } from '../../shared/constants'
import type { ImportTrackItem } from '../../shared/types'
import { fetchWithTimeout } from '../net/fetch-utils'
import type { Importer } from './index'

interface NeteasePlaylistResp {
  result?: { tracks?: { name?: string; ar?: { name?: string }[] }[] }
}

export class NeteaseImporter implements Importer {
  readonly source = 'netease' as const

  async parsePlaylist(url: string): Promise<ImportTrackItem[]> {
    const id = extractPlaylistId(url)
    if (!id) throw new Error('无效的网易云歌单链接')
    const res = await fetchWithTimeout(`https://music.163.com/api/playlist/detail?id=${id}`, {
      headers: { 'User-Agent': DEFAULT_UA, Referer: 'https://music.163.com/' },
    })
    if (!res.ok) throw new Error(`网易云歌单接口 HTTP ${res.status}`)
    const data = (await res.json()) as NeteasePlaylistResp
    const tracks = data?.result?.tracks ?? []
    if (tracks.length === 0) throw new Error('歌单为空或无法访问（可能需要登录或接口受限）')
    return tracks
      .map((t) => ({
        title: t.name ?? '',
        artist: (t.ar ?? []).map((a) => a.name ?? '').filter(Boolean).join('/'),
      }))
      .filter((t) => t.title)
  }
}

export function extractPlaylistId(url: string): string | null {
  try {
    return new URL(url).searchParams.get('id')
  } catch {
    const m = url.match(/[?&]id=(\d+)/)
    return m ? m[1] : null
  }
}
