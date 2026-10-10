// 打包后清理 electron-builder 中间产物与旧版本安装包
// 保留：最新安装包 + .blockmap + latest.yml
import { rmSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dist = join(process.cwd(), 'dist')
const removed = []

try {
  const entries = readdirSync(dist)

  // 1. 解包产物与调试配置
  for (const name of entries) {
    if (
      name.includes('unpacked') ||
      name === 'mac' ||
      name === 'builder-debug.yml' ||
      name === 'builder-effective-config.yaml'
    ) {
      rmSync(join(dist, name), { recursive: true, force: true })
      removed.push(`dist/${name}`)
    }
  }

  // 2. 旧版本安装包（保留最新，按修改时间）
  const setups = entries.filter((f) => /\.exe$/.test(f))
  if (setups.length > 1) {
    const sorted = setups.sort((a, b) => statSync(join(dist, b)).mtimeMs - statSync(join(dist, a)).mtimeMs)
    for (const old of sorted.slice(1)) {
      rmSync(join(dist, old), { force: true })
      rmSync(join(dist, `${old}.blockmap`), { force: true })
      removed.push(`dist/${old}`)
    }
  }
} catch {
  // dist 不存在则忽略
}

console.log(`[cleanup] 已清理: ${removed.length ? removed.join(', ') : '无中间产物'}`)
