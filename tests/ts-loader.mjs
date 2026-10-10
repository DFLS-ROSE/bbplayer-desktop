// ESM resolve hook：为源码补齐 .ts 扩展名并解析 @shared/@renderer 别名
// 供 node --experimental-transform-types --test 运行 TS 单测
import { statSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = process.cwd()
const EXTS = ['.ts', '.tsx', '.mts', '.cts', '.mjs', '.cjs', '.js', '.json']

function isFile(p) {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

function resolveToFile(base) {
  if (isFile(base)) return base
  for (const ext of EXTS) {
    if (isFile(base + ext)) return base + ext
  }
  for (const ext of EXTS) {
    if (isFile(resolve(base, 'index' + ext))) return resolve(base, 'index' + ext)
  }
  return null
}

export async function resolve(specifier, context, nextResolve) {
  // 路径别名
  if (specifier.startsWith('@shared/') || specifier.startsWith('@renderer/')) {
    const base = specifier.startsWith('@shared/')
      ? resolvePath(root, 'src/shared', specifier.slice('@shared/'.length))
      : resolvePath(root, 'src/renderer/src', specifier.slice('@renderer/'.length))
    const file = resolveToFile(base)
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true }
    return nextResolve(specifier, context)
  }

  // 相对路径（源码里常常省略扩展名）
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const parent = context.parentURL ? fileURLToPath(context.parentURL) : resolvePath(root, 'index.js')
    const file = resolveToFile(resolvePath(dirname(parent), specifier))
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true }
    return nextResolve(specifier, context)
  }

  // node: 内置模块 / npm 包名走默认解析
  return nextResolve(specifier, context)
}
