// URL 解析器单元测试：BV / AV 正则与 b23.tv 短链
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UrlResolver } from '../src/main/bilibili/url-resolver.ts'

function makeHttp(impl?: (url: string, params?: Record<string, unknown>) => Promise<unknown>) {
  return { getRaw: impl ?? (async () => ({})) } as never
}

test('BV 号直接解析，无需网络', async () => {
  const r = new UrlResolver(makeHttp())
  assert.deepEqual(await r.resolve('BV1GJ411x7h7'), { bvid: 'BV1GJ411x7h7' })
})

test('包含 BV 号的完整链接也能被正则识别', async () => {
  const r = new UrlResolver(makeHttp())
  assert.deepEqual(await r.resolve('https://www.bilibili.com/video/BV1GJ411x7h7'), { bvid: 'BV1GJ411x7h7' })
})

test('首尾空白被 trim', async () => {
  const r = new UrlResolver(makeHttp())
  assert.deepEqual(await r.resolve('  BV1GJ411x7h7  '), { bvid: 'BV1GJ411x7h7' })
})

test('空输入返回 null', async () => {
  const r = new UrlResolver(makeHttp())
  assert.equal(await r.resolve(''), null)
  assert.equal(await r.resolve('   '), null)
})

test('普通关键词返回 null（交由搜索处理）', async () => {
  const r = new UrlResolver(makeHttp())
  assert.equal(await r.resolve('周杰伦 晴天'), null)
})

test('AV 号解析：提取数字并走 avToBv', async () => {
  let receivedAid: number | null = null
  const http = makeHttp(async (_url, params) => {
    receivedAid = params?.aid as number
    return { data: { bvid: 'BV1GJ411x7h7' } }
  })
  const r = new UrlResolver(http)
  assert.deepEqual(await r.resolve('av170001'), { bvid: 'BV1GJ411x7h7' })
  assert.equal(receivedAid, 170001)
})

test('AV 号大小写不敏感', async () => {
  let receivedAid: number | null = null
  const http = makeHttp(async (_url, params) => {
    receivedAid = params?.aid as number
    return { data: { bvid: 'BV1GJ411x7h7' } }
  })
  const r = new UrlResolver(http)
  await r.resolve('AV170001')
  assert.equal(receivedAid, 170001)
})

test('AV 号转换失败（无 bvid）抛错', async () => {
  const r = new UrlResolver(makeHttp(async () => ({ data: {} })))
  await assert.rejects(() => r.resolve('av170001'), /AV 号 170001 转换失败/)
})

test('b23.tv 短链：跟随重定向后提取 BV', async () => {
  const origFetch = globalThis.fetch
  globalThis.fetch = async () => ({ url: 'https://www.bilibili.com/video/BV1GJ411x7h7' }) as Response
  try {
    const r = new UrlResolver(makeHttp())
    assert.deepEqual(await r.resolve('https://b23.tv/abcd'), { bvid: 'BV1GJ411x7h7' })
  } finally {
    globalThis.fetch = origFetch
  }
})

test('链接中无 BV/AV 号时抛错', async () => {
  const origFetch = globalThis.fetch
  globalThis.fetch = async () => ({ url: 'https://example.com/foo' }) as Response
  try {
    const r = new UrlResolver(makeHttp())
    await assert.rejects(() => r.resolve('https://example.com/foo'), /链接中未识别到 BV \/ AV 号/)
  } finally {
    globalThis.fetch = origFetch
  }
})
