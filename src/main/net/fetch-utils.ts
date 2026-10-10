// ============================================================================
// BBPlayer Desktop —— 统一 fetch 封装：超时 + 取消（AbortController）
// ============================================================================
import { HTTP_TIMEOUT_MS } from '../../shared/constants'

/** 请求超时错误：code = 'TIMEOUT'（供 IPC wrap / 重试判定） */
export class TimeoutError extends Error {
  readonly code: string = 'TIMEOUT'
  constructor(
    public readonly url: string,
    public readonly timeoutMs: number,
  ) {
    super(`请求超时（${timeoutMs}ms）：${url}`)
    this.name = 'TimeoutError'
  }
}

/** 请求取消错误：code = 'ABORTED'（由外部 AbortSignal 触发） */
export class AbortError extends Error {
  readonly code: string = 'ABORTED'
  constructor(public readonly url: string) {
    super(`请求已取消：${url}`)
    this.name = 'AbortError'
  }
}

export interface FetchWithTimeoutOptions {
  /** 超时阈值，默认 HTTP_TIMEOUT_MS */
  timeoutMs?: number
  /** 外部取消信号（重复请求 / 组件卸载时中止在途请求） */
  signal?: AbortSignal
}

/**
 * 带超时与外部取消的 fetch。
 * - 内部 AbortController + setTimeout 超时中止。
 * - 支持外部 signal 取消；finally 清理定时器与监听。
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? HTTP_TIMEOUT_MS
  const external = options.signal
  const controller = new AbortController()

  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onExternalAbort = (): void => controller.abort()

  if (external) {
    if (external.aborted) {
      clearTimeout(timer)
      controller.abort()
    } else {
      external.addEventListener('abort', onExternalAbort, { once: true })
    }
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (e) {
    if (controller.signal.aborted) {
      // 外部取消优先于超时（超时不会同时置 external.aborted）
      if (external?.aborted) throw new AbortError(url)
      throw new TimeoutError(url, timeoutMs)
    }
    throw e
  } finally {
    clearTimeout(timer)
    external?.removeEventListener('abort', onExternalAbort)
  }
}
