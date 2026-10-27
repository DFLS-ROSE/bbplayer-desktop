// B 站 DASH 音轨挑选：只在 Chromium 能解的 AAC 轨里按偏好选档
//
// 背景：`x/player/playurl` 的 `dash.audio` 是数组，按码率从低到高排列，常见档位：
//   30216 → 64K，30232 → 132K，30280 → 192K，30250 → 杜比全景声(ec-3)，30251 → Hi-Res 无损(fLaC)
// 原实现固定取 `audio[0]`，等于永远锁在最差音质；而直接取末尾又会撞上杜比/无损轨，
// 这两类 Chromium 解不了，会直接 mediaError 4（表现为「格式不支持」）。所以必须显式过滤。

/** 用户可选的音质偏好 */
export type AudioQualityPref = 'auto' | 'high' | 'medium' | 'low'

/** 设置页展示用的选项 */
export const AUDIO_QUALITY_OPTIONS: {
  value: AudioQualityPref
  label: string
  hint: string
}[] = [
  { value: 'auto', label: '自动', hint: '在能播的档位里取最高（推荐）' },
  { value: 'high', label: '192K', hint: '高音质，平台有更高档位时仍取 192K' },
  { value: 'medium', label: '132K', hint: '标准音质，兼顾流量与体积' },
  { value: 'low', label: '64K', hint: '省流，适合网络较差时' },
]

/** AAC 音轨的 id → 展示名 */
const AAC_LABELS: Record<number, string> = {
  30216: '64K',
  30232: '132K',
  30280: '192K',
}

/** 已知档位从低到高，用于按偏好就近取档 */
const AAC_ORDER = [30216, 30232, 30280]

/** B 站音轨对象里我们关心的字段（接口两种命名都兼容） */
export interface AudioTrackLike {
  id?: number
  baseUrl?: string
  base_url?: string
  backupUrl?: string[]
  backup_url?: string[]
  bandwidth?: number
  codecs?: string
  mimeType?: string
  mime_type?: string
}

export interface PickedAudio {
  track: AudioTrackLike
  /** 档位展示名，如 192K；无法判定时为带宽换算值或「未知」 */
  label: string
  /** 实际码率 bps，用于日志与提示 */
  bandwidth: number
}

/**
 * 该音轨 Chromium 能否解码。
 * 只认 AAC（mp4a）：杜比（ec-3 / ac-3）与无损（fLaC）解不了，选了只会报错。
 * 没有 codecs 字段时按 id 兜底判断（30250/30251 明确是杜比/无损）。
 */
export function isPlayableAudio(track: AudioTrackLike): boolean {
  const codecs = (track.codecs ?? '').toLowerCase()
  if (codecs) return codecs.includes('mp4a') || codecs.includes('aac')
  const mime = (track.mimeType ?? track.mime_type ?? '').toLowerCase()
  if (mime.includes('mp4')) return true
  if (track.id != null) {
    if (track.id === 30250 || track.id === 30251) return false
    return AAC_ORDER.includes(track.id)
  }
  return true
}

function labelOf(track: AudioTrackLike): string {
  if (track.id != null && AAC_LABELS[track.id]) return AAC_LABELS[track.id]
  const bw = track.bandwidth ?? 0
  if (bw > 0) return `${Math.round(bw / 1000)}K`
  return '未知'
}

/** 偏好对应的目标档位（auto 返回 null，表示取最高） */
function targetIdOf(pref: AudioQualityPref): number | null {
  switch (pref) {
    case 'low':
      return 30216
    case 'medium':
      return 30232
    case 'high':
      return 30280
    default:
      return null
  }
}

/**
 * 按偏好挑一条音轨。
 * - 候选只保留能解码的 AAC 轨；若一条都没有，退回全部音轨里挑（总比直接不播好）
 * - `auto` 取最高档；其余偏好优先取「不超过目标档位」的最高档，没有更低的就用最低档
 */
export function pickAudioTrack(
  tracks: AudioTrackLike[] | null | undefined,
  pref: AudioQualityPref = 'auto',
): PickedAudio | null {
  const list = (tracks ?? []).filter((t) => t && (t.baseUrl || t.base_url))
  if (list.length === 0) return null

  const playable = list.filter(isPlayableAudio)
  // 没有任何 AAC 轨时退回全部候选（尽力而为，失败会走备用地址切换）
  const pool = (playable.length > 0 ? playable : list)
    .slice()
    .sort((a, b) => (a.bandwidth ?? 0) - (b.bandwidth ?? 0) || (a.id ?? 0) - (b.id ?? 0))

  const targetId = targetIdOf(pref)
  let picked: AudioTrackLike
  if (targetId == null) {
    picked = pool[pool.length - 1]
  } else {
    const atOrBelow = pool.filter((t) => {
      const idx = t.id != null ? AAC_ORDER.indexOf(t.id) : -1
      // 未知档位按码率比较：目标档位的码率上限约为 192K/132K/64K
      const capMbps = targetId === 30280 ? 200_000 : targetId === 30232 ? 140_000 : 70_000
      return idx >= 0 ? idx <= AAC_ORDER.indexOf(targetId) : (t.bandwidth ?? 0) <= capMbps
    })
    picked = atOrBelow.length > 0 ? atOrBelow[atOrBelow.length - 1] : pool[0]
  }

  return { track: picked, label: labelOf(picked), bandwidth: picked.bandwidth ?? 0 }
}
