// ============================================================================
// 歌词偏移：纯函数工具（解析旧缓存里的 [offset:] 标签 / 归一步长 / 展示格式）
// 渲染进程与测试共用，避免逻辑散落在组件里无法覆盖。
// ============================================================================

/** 偏移步长（秒） */
export const OFFSET_FINE = 0.1
export const OFFSET_COARSE = 0.5

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

/**
 * 偏移归一到 0.1 秒步长，非法值归零。
 *
 * 不设上限：一首歌的歌词整体错位几十秒很常见（前奏长、视频开头有口播、
 * 合集里歌词来自另一段），设上限会让「点歌词行对齐」算出的正确值被截断，
 * 反而更不准。误操作可以按「归零」撤销。
 */
export function normalizeOffset(sec: number): number {
  if (!Number.isFinite(sec)) return 0
  return Math.round(sec * 10) / 10
}

/** 展示格式：±0.0s（正数表示歌词提前） */
export function formatOffset(sec: number): string {
  if (!Number.isFinite(sec) || Math.abs(sec) < 0.05) return '±0.0s'
  return `${sec > 0 ? '+' : '-'}${Math.abs(sec).toFixed(1)}s`
}
