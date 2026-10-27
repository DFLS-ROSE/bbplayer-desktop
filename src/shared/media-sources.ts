// 播放源候选列表：主地址在前，备用 CDN 地址依次在后（去空、去重、保序）
// 渲染层按顺序尝试，某个节点 403/503 时切到下一个，避免单节点抖动导致整首放不出来。

/** 组装候选播放地址列表 */
export function buildSourceList(
  primary: string | null | undefined,
  backups?: (string | null | undefined)[] | null,
): string[] {
  const out: string[] = []
  const push = (u: string | null | undefined): void => {
    if (typeof u !== 'string') return
    const trimmed = u.trim()
    if (!trimmed) return
    if (out.includes(trimmed)) return
    out.push(trimmed)
  }
  push(primary)
  for (const b of backups ?? []) push(b)
  return out
}

/** 从 URL 取主机名，取不到时返回空串（仅用于日志与诊断） */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}
