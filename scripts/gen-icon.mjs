// 生成 256x256 纯色渐变 + 白色播放三角的占位应用图标（无第三方依赖）
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const W = 256
const H = 256

// ---- CRC32 ----
const crcTable = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[n] = c
}
function crc32(buf) {
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

// ---- 像素绘制 ----
const pixels = Buffer.alloc(W * H * 4)
function setPixel(x, y, r, g, b, a) {
  const i = (y * W + x) * 4
  pixels[i] = r
  pixels[i + 1] = g
  pixels[i + 2] = b
  pixels[i + 3] = a
}
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = (x + y) / (W + H)
    const r = Math.round(251 - t * 60)
    const g = Math.round(114 - t * 30)
    const b = Math.round(153 + t * 60)
    setPixel(x, y, r, g, b, 255)
  }
}
// 居中白色圆角播放三角
const cx = 128
const cy = 128
const p1 = [cx - 34, cy - 52]
const p2 = [cx - 34, cy + 52]
const p3 = [cx + 62, cy]
function insideTriangle(px, py, a, b, c) {
  const sign = (p1x, p1y, p2x, p2y, p3x, p3y) =>
    (p1x - p3x) * (p2y - p3y) - (p2x - p3x) * (p1y - p3y)
  const d1 = sign(px, py, a[0], a[1], b[0], b[1])
  const d2 = sign(px, py, b[0], b[1], c[0], c[1])
  const d3 = sign(px, py, c[0], c[1], a[0], a[1])
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (insideTriangle(x + 0.5, y + 0.5, p1, p2, p3)) setPixel(x, y, 255, 255, 255, 255)
  }
}

// ---- 组装 PNG ----
const raw = Buffer.alloc(H * (W * 4 + 1))
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0 // filter: none
  pixels.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4)
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type RGBA
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const out = resolve(__dirname, '../resources/icon.png')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)
console.log(`已生成图标：${out}（${png.length} 字节）`)
