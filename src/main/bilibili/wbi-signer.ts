// WBI 签名：mixinKeyEncTab 重排 + Node 内置 crypto MD5（不引入 js-md5）
import { createHash } from 'node:crypto'
import { BILI_API_BASE } from '../../shared/constants'
import type { HttpClient, WbiSignerLike } from './http-client'

// 标准重排表（以 nav 接口实际返回的 img_key/sub_key 校验）
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29,
  28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25,
  54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]

interface NavWbiData {
  code?: number
  data?: { wbi_img?: { img_url?: string; sub_url?: string } }
}

export class WbiSigner implements WbiSignerLike {
  private imgKey = ''
  private subKey = ''
  private initialized = false

  constructor(private readonly http: HttpClient) {}

  /** 从 nav 接口取 wbi_img，惰性初始化（首次签名前调用） */
  async ensureInit(): Promise<void> {
    if (this.initialized) return
    const data = await this.http.getRaw<NavWbiData>(`${BILI_API_BASE}/x/web-interface/nav`)
    const wbi = data?.data?.wbi_img
    if (!wbi?.img_url || !wbi?.sub_url) {
      throw new Error('获取 WBI 密钥失败（nav 接口未返回 wbi_img）')
    }
    this.imgKey = this.extractKey(wbi.img_url)
    this.subKey = this.extractKey(wbi.sub_url)
    this.initialized = true
  }

  /** 追加 wts 并对排序后的参数做 URL 编码 + MD5 生成 w_rid */
  sign(params: Record<string, unknown>): Record<string, unknown> {
    const wts = Math.round(Date.now() / 1000)
    const all: Record<string, unknown> = { ...params, wts }
    const filtered: Record<string, string> = {}
    for (const k of Object.keys(all).sort()) {
      const v = all[k]
      if (v === undefined || v === null) continue
      filtered[k] = String(v).replace(/[!'()*]/g, '')
    }
    const query = Object.keys(filtered)
      .sort()
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(filtered[k])}`)
      .join('&')
    const wRid = createHash('md5').update(query + this.getMixinKey()).digest('hex')
    // wts 以 number 返回（参与签名的是 filtered 内的 string 形式，此处用原始 number 覆盖）
    return { ...filtered, wts, w_rid: wRid }
  }

  private getMixinKey(): string {
    const combined = this.imgKey + this.subKey
    return MIXIN_KEY_ENC_TAB.map((i) => combined[i] ?? '').join('').slice(0, 32)
  }

  private extractKey(url: string): string {
    const name = url.slice(url.lastIndexOf('/') + 1)
    return name.replace(/\.(png|jpg|jpeg)$/, '')
  }
}
