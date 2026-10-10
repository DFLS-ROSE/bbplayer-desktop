// ============================================================================
// BBPlayer Desktop —— 每域并发 / 间隔限流 + 分片批量
// ============================================================================
import { BILI_CONCURRENCY, BILI_MIN_INTERVAL_MS } from '../../shared/constants'

/** 信号量 + 最小间隔限流器：控制每域并发峰值与请求间隔 */
export class RateLimiter {
  private active = 0
  private readonly queue: (() => void)[] = []
  private lastRunAt = 0

  constructor(
    private readonly maxConcurrent: number = BILI_CONCURRENCY,
    private readonly minIntervalMs: number = BILI_MIN_INTERVAL_MS,
  ) {}

  /** 申请执行许可：并发满则排队，通过后保证与上次请求的最小间隔 */
  async acquire(): Promise<void> {
    if (this.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.queue.push(resolve))
    }
    this.active++
    await this.waitInterval()
  }

  release(): void {
    this.active = Math.max(0, this.active - 1)
    const next = this.queue.shift()
    if (next) next()
  }

  /** 包裹一次异步任务：自动 acquire/release */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  private async waitInterval(): Promise<void> {
    const now = Date.now()
    const wait = this.lastRunAt + this.minIntervalMs - now
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
    this.lastRunAt = Date.now()
  }
}

/** 对数组分片并发执行（保留原顺序），替换逐条串行 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  if (items.length === 0) return results

  let nextIndex = 0
  const workerCount = Math.max(1, Math.min(limit, items.length))
  const workers: Promise<void>[] = []

  for (let w = 0; w < workerCount; w++) {
    workers.push(
      (async () => {
        while (true) {
          const i = nextIndex++
          if (i >= items.length) break
          results[i] = await fn(items[i], i)
        }
      })(),
    )
  }

  await Promise.all(workers)
  return results
}
