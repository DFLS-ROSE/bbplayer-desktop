// Material You 动态取色：从封面提取主色 + 生成 MD3 tonal palette
// 纯前端 Canvas 实现（B 站图片已支持 CORS，可直接跨域读取像素）

export interface M3Palette {
  accent: string
  onAccent: string
  accentContainer: string
  onAccentContainer: string
}

// ============ 色彩空间工具 ============
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return { h, s: s * 100, l: l * 100 }
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360
  s = Math.max(0, Math.min(100, s)) / 100
  l = Math.max(0, Math.min(100, l)) / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) {
    r = c
    g = x
  } else if (h < 120) {
    r = x
    g = c
  } else if (h < 180) {
    g = c
    b = x
  } else if (h < 240) {
    g = x
    b = c
  } else if (h < 300) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16)
  const g = parseInt(m.slice(2, 4), 16)
  const b = parseInt(m.slice(4, 6), 16)
  return rgbToHsl(r, g, b)
}

export function hslToHex(h: number, s: number, l: number): string {
  const { r, g, b } = hslToRgb(h, s, l)
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

// ============ 主色提取 ============
interface Bucket {
  r: number
  g: number
  b: number
  count: number
}

/**
 * 从封面图 URL 提取主色。失败（跨域/加载失败/无有效像素）返回 null。
 */
export function extractDominantColor(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!url) return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const size = 48
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)

        const step = 24
        const buckets = new Map<number, Bucket>()
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const a = data[i + 3]
          if (a < 125) continue
          const key = ((Math.floor(r / step) * step) << 16) | ((Math.floor(g / step) * step) << 8) | (Math.floor(b / step) * step)
          const cur = buckets.get(key)
          if (cur) {
            cur.r += r
            cur.g += g
            cur.b += b
            cur.count++
          } else {
            buckets.set(key, { r, g, b, count: 1 })
          }
        }
        if (buckets.size === 0) return resolve(null)

        const arr = [...buckets.values()].sort((a, b) => {
          const aGood = isGoodColor(a)
          const bGood = isGoodColor(b)
          if (aGood !== bGood) return aGood ? -1 : 1
          return b.count - a.count
        })
        const best = arr[0]
        const r = Math.round(best.r / best.count)
        const g = Math.round(best.g / best.count)
        const b = Math.round(best.b / best.count)
        resolve(`#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/** 判定是否为「有代表性」的颜色：排除纯灰/纯白/纯黑 */
function isGoodColor(c: { r: number; g: number; b: number }): boolean {
  const { s, l } = rgbToHsl(c.r, c.g, c.b)
  return s > 15 && l > 18 && l < 88
}

// ============ MD3 调色 ============
/**
 * 以主色为 seed 生成 MD3 语义色。
 * @param isDark 深色模式下的亮度档位不同
 */
export function buildM3Palette(seed: string, isDark: boolean): M3Palette {
  const { h, s } = hexToHsl(seed)
  const accentS = Math.max(42, Math.min(s, 88))
  const accentL = isDark ? 62 : 45
  return {
    accent: hslToHex(h, accentS, accentL),
    onAccent: '#ffffff',
    accentContainer: hslToHex(h, isDark ? Math.max(s, 28) : Math.min(s + 12, 88), isDark ? 26 : 91),
    onAccentContainer: hslToHex(h, Math.max(s, 38), isDark ? 88 : 27),
  }
}
