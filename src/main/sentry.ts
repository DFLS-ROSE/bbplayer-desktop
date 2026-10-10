// ============================================================================
// BBPlayer Desktop —— Sentry 崩溃上报（P2 预留，默认关闭）
// DSN 注入 + 开关（settings.enableTelemetry）+ 采样率 + beforeSend 脱敏。
// 依赖缺失时动态 import 优雅降级，不阻塞启动、不加载 native。
// ============================================================================
import { createTraceId, logInfo, logWarn } from './logger'
import type { AppStore } from './store/app-store'

interface SentryMainModule {
  init: (options: Record<string, unknown>) => void
}

/** 初始化 Sentry（未注入 DSN 或未开启 telemetry 时默认关闭） */
export async function initSentry(appStore: AppStore): Promise<void> {
  const dsn = process.env['SENTRY_DSN']
  const enabled = !!dsn && appStore.getSettings().enableTelemetry
  if (!enabled) {
    logInfo('sentry', '崩溃上报未启用（默认关闭）', { traceId: createTraceId() })
    return
  }

  const parsed = Number.parseFloat(process.env['SENTRY_SAMPLE_RATE'] ?? '1.0')
  const sampleRate = Number.isFinite(parsed) ? parsed : 1.0

  try {
    // 动态 import：@sentry/electron 未安装时仅记录告警，不抛出、不阻塞启动
    const sentryMainPath: string = '@sentry/electron/main'
    const mod = (await import(sentryMainPath)) as SentryMainModule
    mod.init({
      dsn,
      sampleRate,
      beforeSend: sanitizeEvent,
    })
    logInfo('sentry', 'Sentry 已初始化', { traceId: createTraceId(), sampleRate })
  } catch (e) {
    logWarn('sentry', 'Sentry 初始化失败（依赖缺失或环境异常），已降级跳过', {
      traceId: createTraceId(),
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

/** beforeSend 脱敏：剥离 Cookie 头 / sessionCookie / userInfo.face 等敏感字段 */
function sanitizeEvent(event: Record<string, unknown>): Record<string, unknown> | null {
  try {
    const sanitized = JSON.parse(JSON.stringify(event)) as Record<string, unknown>
    stripSensitive(sanitized)
    return sanitized
  } catch {
    return null
  }
}

function stripSensitive(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) stripSensitive(item)
    return
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    for (const key of Object.keys(obj)) {
      if (/cookie|sessdata|bili_jct|face|token|authorization/i.test(key)) {
        obj[key] = '[REDACTED]'
      } else {
        stripSensitive(obj[key])
      }
    }
  }
}
