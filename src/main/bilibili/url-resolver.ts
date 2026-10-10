// BV / AV / b23.tv 短链解析
import { BILI_API_BASE, DEFAULT_UA } from '../../shared/constants'
import { fetchWithTimeout } from '../net/fetch-utils'
import type { HttpClient } from './http-client'

const BV_RE = /BV[0-9A-Za-z]{10}/
const AV_RE = /av(\d+)/i
const URL_RE = /^(https?:\/\/|b23\.tv)/i

export class UrlResolver {
  constructor(private readonly http: HttpClient) {}

  /**
   * 识别 BV 号 / AV 号 / 短链，返回 bvid。
   * 普通关键词返回 null（交由搜索处理）；无法识别的链接抛错。
   */
  async resolve(input: string): Promise<{ bvid: string } | null> {
    const trimmed = input.trim()
    if (!trimmed) return null

    const bv = trimmed.match(BV_RE)
    if (bv) return { bvid: bv[0] }

    const av = trimmed.match(AV_RE)
    if (av) return this.avToBv(Number(av[1]))

    if (URL_RE.test(trimmed)) {
      const finalUrl = await this.followRedirect(trimmed)
      const bv2 = finalUrl.match(BV_RE)
      if (bv2) return { bvid: bv2[0] }
      const av2 = finalUrl.match(AV_RE)
      if (av2) return this.avToBv(Number(av2[1]))
      throw new Error('链接中未识别到 BV / AV 号')
    }

    return null
  }

  private async avToBv(aid: number): Promise<{ bvid: string }> {
    const data = await this.http.getRaw<{ code?: number; data?: { bvid?: string } }>(
      `${BILI_API_BASE}/x/web-interface/view`,
      { aid },
    )
    const bvid = data?.data?.bvid
    if (!bvid) throw new Error(`AV 号 ${aid} 转换失败`)
    return { bvid }
  }

  private async followRedirect(url: string): Promise<string> {
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': DEFAULT_UA },
    })
    return res.url || url
  }
}
