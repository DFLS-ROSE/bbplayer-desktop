// ============================================================================
// BBPlayer Desktop —— 统一结构化日志（electron-log 封装）
// 分级 / 滚动截断 / traceId；渲染进程经 IPC log:write 汇入主进程同一文件。
// ============================================================================
import log from 'electron-log/main'
import { randomUUID } from 'node:crypto'
import type { LogEntry } from '../shared/types'

export type LogMeta = Record<string, unknown>

/** 初始化日志：5MB 滚动截断 + 分级输出。幂等，可重复调用。 */
export function initializeLogger(): void {
  log.transports.file.maxSize = 5 * 1024 * 1024
  log.transports.file.level = 'debug'
  log.transports.console.level = 'info'
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
}

/** 生成一次请求 / 崩溃贯穿的追踪 ID */
export function createTraceId(): string {
  return randomUUID()
}

/** 渲染进程经 IPC 汇入的日志条目，写入主进程同一文件 */
export function writeLogEntry(entry: LogEntry): void {
  const writer =
    entry.level === 'error'
      ? logError
      : entry.level === 'warn'
        ? logWarn
        : entry.level === 'debug'
          ? logDebug
          : logInfo
  writer(entry.scope, entry.message, entry.extra)
}

export function logError(scope: string, message: string, meta?: LogMeta): void {
  log.error(message, withScope(scope, meta))
}

export function logWarn(scope: string, message: string, meta?: LogMeta): void {
  log.warn(message, withScope(scope, meta))
}

export function logInfo(scope: string, message: string, meta?: LogMeta): void {
  log.info(message, withScope(scope, meta))
}

export function logDebug(scope: string, message: string, meta?: LogMeta): void {
  log.debug(message, withScope(scope, meta))
}

function withScope(scope: string, meta?: LogMeta): LogMeta {
  const next: LogMeta = { ...(meta ?? {}), scope }
  if (next.traceId === undefined) next.traceId = createTraceId()
  return next
}
