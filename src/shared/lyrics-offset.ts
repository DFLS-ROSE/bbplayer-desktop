// ============================================================================
// 歌词偏移：纯函数工具（解析旧缓存里的 [offset:] 标签 / 归一步长 / 展示格式）
// 渲染进程与测试共用，避免逻辑散落在组件里无法覆盖。
// ============================================================================

/** 偏移步长与上下限（秒） */
export const OFFSET_FINE = 0.1
export const OFFSET_COARSE = 0.5
export const OFFSET_LIMIT = 10

/**
 * 去掉 LRC 里的 `[offset:毫秒]` 标签。
 * 旧版本把用户偏移写进歌词正文，现在偏移独立存库（按 BV 号），
 * 必须剥掉标签，否则解析器会再叠加一次，形成「双重偏移」。
 */
export function stripOffsetTag(lrc: string): string {
  return lrc.replace(/\[offset:\s*-?\d+\s*\]\s*/gi, '')
}

/** 读取 LRC 里的 `[offset:毫秒]`，换算为秒；没有则返回 0（用于迁移旧缓存） */
export function readOffsetTagSec(lrc: string): number {
  const m = lrc.match(/\[offset:\s*(-?\d+)\s*\]/i)
  return m ? Number(m[1]) / 1000 : 0
}

/** 偏移归一到 0.1 秒步长并限制在 ±10 秒内 */
export function clampOffset(sec: number, limit = OFFSET_LIMIT): number {
  if (!Number.isFinite(sec)) return 0
  const rounded = Math.round(sec * 10) / 10
  return Math.max(-limit, Math.min(limit, rounded))
}

/** 展示格式：±0.0s（正数表示歌词提前） */
export function formatOffset(sec: number): string {
  if (!Number.isFinite(sec) || Math.abs(sec) < 0.05) return '±0.0s'
  return `${sec > 0 ? '+' : '-'}${Math.abs(sec).toFixed(1)}s`
}
