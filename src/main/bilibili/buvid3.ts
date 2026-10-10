// buvid3 Cookie 生成 / 持久化（无则调 /x/frontend/finger/spi 生成）
import { BILI_API_BASE } from '../../shared/constants'
import { logWarn } from '../logger'
import type { AppStore } from '../store/app-store'
import type { HttpClient } from './http-client'

interface SpiResponse {
  code?: number
  data?: { b_3?: string; b_4?: string }
}

export class Buvid3Manager {
  constructor(
    private readonly appStore: AppStore,
    private readonly http: HttpClient,
  ) {}

  /** 确保存在 buvid3 / buvid4，返回 buvid3 最终值（获取失败返回现有 buvid3 或空串，不阻断流程） */
  async ensure(): Promise<string> {
    const storedB3 = this.appStore.getBuvid3()
    const storedB4 = this.appStore.getBuvid4()
    // 双值齐全才短路；存量用户仅有 buvid3 时仍需回填 buvid4
    if (storedB3 && storedB4) return storedB3
    try {
      const data = await this.http.getRaw<SpiResponse>(`${BILI_API_BASE}/x/frontend/finger/spi`)
      const b3 = data?.data?.b_3 || ''
      const b4 = data?.data?.b_4 || ''
      // 已有 buvid3 时不覆盖（升级回填场景），仅补 buvid4
      if (!storedB3 && b3) this.appStore.setBuvid3(b3)
      if (b4) this.appStore.setBuvid4(b4)
      // 兜底：历史上偶发仅返回 b_4 时，将其作为 buvid3 使用以保障链路可用
      if (!storedB3 && !b3 && b4) this.appStore.setBuvid3(b4)
      return storedB3 || b3 || b4 || ''
    } catch (e) {
      logWarn('buvid3', '获取失败', { error: e instanceof Error ? e.message : String(e) })
      return storedB3 || ''
    }
  }

  getCookieHeader(): string {
    const parts: string[] = []
    const b3 = this.appStore.getBuvid3()
    const b4 = this.appStore.getBuvid4()
    if (b3) parts.push(`buvid3=${b3}`)
    if (b4) parts.push(`buvid4=${b4}`)
    return parts.join('; ')
  }
}
