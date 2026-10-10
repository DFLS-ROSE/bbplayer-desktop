// 主进程统一 HTTP 客户端：注入桌面 Chrome UA / Referer / Origin / Cookie
// 超时 / 取消 / 有限重试 + 鉴权失效（-101）回调
import {
  BILI_ORIGIN,
  BILI_REFERER,
  DEFAULT_UA,
  HTTP_RETRY_BASE_DELAY_MS,
  HTTP_RETRY_MAX,
  HTTP_RETRY_MAX_DELAY_MS,
  HTTP_TIMEOUT_MS,
} from '../../shared/constants'
import { AbortError, TimeoutError, fetchWithTimeout } from '../net/fetch-utils'
import { createTraceId, logDebug, logError, logWarn } from '../logger'

// —— 统一错误类型（含 code 字段，供 IPC wrap 转 Result）——
export class HttpError extends Error {
  readonly code: string
  constructor(
    public readonly status: number,
    public readonly url: string,
  ) {
    super(`HTTP ${status}: ${url}`)
    this.name = 'HttpError'
    this.code = `HTTP_${status}`
  }
}

export class BiliError extends Error {
  readonly code: string
  readonly biliCode: number
  constructor(biliCode: number, message: string) {
    super(message)
    this.name = 'BiliError'
    this.biliCode = biliCode
    this.code = `BILI_${biliCode}`
  }
}

// WBI 签名器最小接口（避免与 wbi-signer 形成运行时循环依赖）
export interface WbiSignerLike {
  ensureInit(): Promise<void>
  sign(params: Record<string, unknown>): Record<string, unknown>
}

export interface RequestConfig {
  url: string
  method?: 'GET' | 'POST'
  params?: Record<string, unknown>
  body?: unknown
  headers?: Record<string, string>
  wbi?: boolean
  timeoutMs?: number
  signal?: AbortSignal
  retries?: number
}

interface FullResponse<T> {
  data: T
  cookies: string[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 判定瞬时错误是否可重试：超时 / HTTP 5xx / 断网；取消与业务错误不重试 */
function isRetriable(e: unknown): boolean {
  if (e instanceof TimeoutError) return true
  if (e instanceof AbortError) return false
  if (e instanceof HttpError) return e.status >= 500
  if (e instanceof TypeError) return true // fetch 断网 / DNS 失败抛 TypeError
  return false
}

export class HttpClient {
  private wbiSigner: WbiSignerLike | null = null
  private readonly getCookie: () => string
  private onAuthFailure: (() => void | Promise<void>) | null = null
  private readonly inflight = new Map<string, AbortController>()

  constructor(opts: { getCookie: () => string }) {
    this.getCookie = opts.getCookie
  }

  setWbiSigner(s: WbiSignerLike): void {
    this.wbiSigner = s
  }

  /** 由 AuthService 注册：请求返回 -101 时触发（清 Cookie + 清 userInfo + push） */
  setOnAuthFailure(cb: () => void | Promise<void>): void {
    this.onAuthFailure = cb
  }

  /** 期望 B 站标准 { code, data } 响应：自动校验 code===0 并返回 data */
  async requestData<T>(config: RequestConfig): Promise<T> {
    const traceId = createTraceId()
    const { data } = await this.requestFull<{ code?: number; message?: string; data?: T }>(config, traceId)
    if (data && typeof data.code === 'number' && data.code !== 0) {
      const err = new BiliError(data.code, data.message || 'B 站接口返回错误')
      if (data.code === -101) {
        logWarn('bili.http', 'B 站鉴权失效（-101），触发登录态失效回调', { traceId })
        try {
          await this.onAuthFailure?.()
        } catch (e) {
          logError('bili.http', '鉴权失效回调执行失败', { traceId, error: e instanceof Error ? e.message : String(e) })
        }
      }
      throw err
    }
    return (data?.data ?? undefined) as T
  }

  /** 返回完整 JSON（不校验 code，供扫码轮询 / nav 等自处理） */
  async requestRaw<T>(config: RequestConfig): Promise<T> {
    const { data } = await this.requestFull<T>(config)
    return data
  }

  async requestFull<T>(config: RequestConfig, traceId?: string): Promise<FullResponse<T>> {
    const tid = traceId ?? createTraceId()
    const method = config.method ?? 'GET'
    let params = config.params ?? {}
    if (config.wbi) {
      if (!this.wbiSigner) throw new Error('WBI 签名器未初始化')
      await this.wbiSigner.ensureInit()
      params = this.wbiSigner.sign(params)
    }

    const url = this.buildUrl(config.url, params)
    const headers = this.buildHeaders(config.headers)
    const init: RequestInit = { method, headers }
    if (config.body !== undefined) {
      if (config.body instanceof URLSearchParams) {
        init.body = config.body.toString()
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
      } else if (typeof config.body === 'string') {
        init.body = config.body
      } else {
        init.body = JSON.stringify(config.body)
        headers['Content-Type'] = 'application/json'
      }
    }

    const maxRetries = method === 'GET' ? (config.retries ?? HTTP_RETRY_MAX) : 0
    logDebug('net.http', '请求开始', { url, method, traceId: tid })

    let lastErr: unknown
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // 同 URL + 参数在途取消：新请求到来即中止旧请求（最近一次结果覆盖）
      const cancelKey = `${method} ${this.buildUrl(config.url, config.params ?? {})}`
      const controller = this.beginInflight(cancelKey)
      try {
        const res = await fetchWithTimeout(
          url,
          init,
          { timeoutMs: config.timeoutMs ?? HTTP_TIMEOUT_MS, signal: controller.signal },
        )
        const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
        if (!res.ok) throw new HttpError(res.status, url)

        const text = await res.text()
        let data: T
        try {
          data = (text ? JSON.parse(text) : {}) as T
        } catch {
          data = text as unknown as T
        }
        return { data, cookies }
      } catch (e) {
        lastErr = e
        if (attempt >= maxRetries || !isRetriable(e)) throw e
        const delay = Math.min(HTTP_RETRY_BASE_DELAY_MS * 2 ** attempt, HTTP_RETRY_MAX_DELAY_MS)
        logWarn('net.http', '请求失败，准备重试', { url, method, traceId: tid, attempt: attempt + 1, delay })
        await sleep(delay)
      } finally {
        this.endInflight(cancelKey, controller)
      }
    }
    throw lastErr
  }

  get<T>(url: string, params?: Record<string, unknown>, opts?: { wbi?: boolean }): Promise<T> {
    return this.requestData<T>({ url, params, wbi: opts?.wbi })
  }

  getRaw<T>(url: string, params?: Record<string, unknown>, opts?: { wbi?: boolean }): Promise<T> {
    return this.requestRaw<T>({ url, params, wbi: opts?.wbi })
  }

  post<T>(url: string, body: unknown, opts?: { wbi?: boolean }): Promise<T> {
    return this.requestData<T>({ url, body, method: 'POST', wbi: opts?.wbi })
  }

  private beginInflight(key: string): AbortController {
    this.inflight.get(key)?.abort()
    const controller = new AbortController()
    this.inflight.set(key, controller)
    return controller
  }

  private endInflight(key: string, controller: AbortController): void {
    if (this.inflight.get(key) === controller) {
      this.inflight.delete(key)
    }
  }

  private buildUrl(base: string, params?: Record<string, unknown>): string {
    const url = new URL(base)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue
        url.searchParams.set(k, String(v))
      }
    }
    return url.toString()
  }

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const cookie = this.getCookie()
    const headers: Record<string, string> = {
      'User-Agent': DEFAULT_UA,
      Referer: BILI_REFERER,
      Origin: BILI_ORIGIN,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      ...extra,
    }
    if (cookie) headers.Cookie = cookie
    return headers
  }
}
