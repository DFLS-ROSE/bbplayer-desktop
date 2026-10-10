// QQ 音乐歌单导入：解析歌单 → 歌名 + 歌手列表
import { DEFAULT_UA } from '../../shared/constants'
import type { ImportTrackItem } from '../../shared/types'
import { fetchWithTimeout } from '../net/fetch-utils'
import type { Importer } from './index'

interface QqPlaylistResp {
  cdlist?: { songlist?: { songname?: string; singer?: { name?: string }[] }[] }[]
}

export class QqImporter implements Importer {
  readonly source = 'qq' as const

  async parsePlaylist(url: string): Promise<ImportTrackItem[]> {
    const id = this.extractId(url)
    if (!id) throw new Error('无效的 QQ 音乐歌单链接')

    const u = new URL('https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg')
    u.searchParams.set('type', '1')
    u.searchParams.set('json', '1')
    u.searchParams.set('utf8', '1')
    u.searchParams.set('onlysong', '0')
    u.searchParams.set('disstid', id)
    u.searchParams.set('format', 'json')

    const res = await fetchWithTimeout(u.toString(), {
      headers: { 'User-Agent': DEFAULT_UA, Referer: 'https://y.qq.com/' },
    })
    if (!res.ok) throw new Error(`QQ 歌单接口 HTTP ${res.status}`)
    const data = (await res.json()) as QqPlaylistResp
    const songlist = data?.cdlist?.[0]?.songlist ?? []
    if (songlist.length === 0) throw new Error('歌单为空或无法访问（可能需要登录或接口受限）')
    return songlist
      .map((s) => ({
        title: s.songname ?? '',
        artist: (s.singer ?? []).map((a) => a.name ?? '').filter(Boolean).join('/'),
      }))
      .filter((t) => t.title)
  }

  private extractId(url: string): string | null {
    try {
      const u = new URL(url)
      if (u.searchParams.has('id')) return u.searchParams.get('id')
      const m = u.pathname.match(/playlist\/(\d+)/)
      if (m) return m[1]
      return null
    } catch {
      const m = url.match(/playlist\/(\d+)/)
      return m ? m[1] : null
    }
  }
}
