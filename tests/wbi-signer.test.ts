// WBI 签名器单元测试：mixinKey 派生 + MD5 w_rid + 参数过滤
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { WbiSigner } from '../src/main/bilibili/wbi-signer.ts'

// 标准 mixinKeyEncTab（架构文档 7.6 规定的重排表，用于独立计算期望值）
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29,
  28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25,
  54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]

// 固定 img/sub key（各 32 字符，拼接后正好 64 字符供重排表取用）
const IMG_KEY = '0123456789abcdef0123456789abcdef'
const SUB_KEY = 'fedcba9876543210fedcba9876543210'

function makeNavMock(imgUrl: string, subUrl: string, counter?: { calls: number }) {
  return {
    getRaw: async () => {
      if (counter) counter.calls += 1
      return { code: 0, data: { wbi_img: { img_url: imgUrl, sub_url: subUrl } } }
    },
  }
}

function expectedMixinKey(img: string, sub: string): string {
  const combined = img + sub
  return MIXIN_KEY_ENC_TAB.map((i) => combined[i] ?? '').join('').slice(0, 32)
}

test('mixinKey 派生：固定 img/sub key 得到标准重排结果', async () => {
  const signer = new WbiSigner(
    makeNavMock(`https://i0.hdslb.com/bfs/wbi/${IMG_KEY}.png`, `https://i0.hdslb.com/bfs/wbi/${SUB_KEY}.png`) as never,
  )
  await signer.ensureInit()
  // private 为编译期概念，运行时属性可直接访问（参数属性/private 在 strip 后即普通属性）
  assert.equal((signer as unknown as { imgKey: string }).imgKey, IMG_KEY)
  assert.equal((signer as unknown as { subKey: string }).subKey, SUB_KEY)
  assert.equal(
    (signer as unknown as { getMixinKey(): string }).getMixinKey(),
    expectedMixinKey(IMG_KEY, SUB_KEY),
  )
})

test('sign：按 B 站标准算法 w_rid 必须包含 wts 参与签名', async () => {
  const signer = new WbiSigner(
    makeNavMock(`https://i0.hdslb.com/bfs/wbi/${IMG_KEY}.png`, `https://i0.hdslb.com/bfs/wbi/${SUB_KEY}.png`) as never,
  )
  await signer.ensureInit()

  const input = { bvid: 'BV1GJ411x7h7', cid: 12345, qn: 64 }
  const result = signer.sign(input) as Record<string, string | number>
  assert.equal(typeof result.wts, 'number')
  assert.equal(typeof result.w_rid, 'string')

  // 数值参数被 String() 化
  assert.equal(result.cid, '12345')
  assert.equal(result.qn, '64')

  // 标准算法（bilibili-API-collect / 架构文档 7.6）：
  // 先把 wts 加入参数 → 按键排序 → 过滤 value 中 !'()* → URL 编码 → + mixinKey → MD5
  const all: Record<string, unknown> = { ...input, wts: result.wts }
  const filtered: Record<string, string> = {}
  for (const k of Object.keys(all).sort()) {
    const v = all[k]
    if (v === undefined || v === null) continue
    filtered[k] = String(v).replace(/[!'()*]/g, '')
  }
  const query = Object.keys(filtered)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(filtered[k])}`)
    .join('&')
  const expectedWrid = createHash('md5')
    .update(query + expectedMixinKey(IMG_KEY, SUB_KEY))
    .digest('hex')
  assert.equal(result.w_rid, expectedWrid, 'w_rid 未包含 wts，B 站服务端会风控校验失败')
})

test('sign：过滤值中的 !\'()* 特殊字符', async () => {
  const signer = new WbiSigner(
    makeNavMock(`https://i0.hdslb.com/bfs/wbi/${IMG_KEY}.png`, `https://i0.hdslb.com/bfs/wbi/${SUB_KEY}.png`) as never,
  )
  await signer.ensureInit()
  const result = signer.sign({ q: "a!b'c(d)e*f" }) as Record<string, string>
  assert.equal(result.q, 'abcdef')
})

test('sign：跳过 undefined / null 参数', async () => {
  const signer = new WbiSigner(
    makeNavMock(`https://i0.hdslb.com/bfs/wbi/${IMG_KEY}.png`, `https://i0.hdslb.com/bfs/wbi/${SUB_KEY}.png`) as never,
  )
  await signer.ensureInit()
  const result = signer.sign({ a: 1, b: undefined, c: null }) as Record<string, string>
  assert.equal(result.a, '1')
  assert.ok(!('b' in result))
  assert.ok(!('c' in result))
})

test('ensureInit：nav 未返回 wbi_img 时抛错', async () => {
  const signer = new WbiSigner({ getRaw: async () => ({ code: 0, data: {} }) } as never)
  await assert.rejects(() => signer.ensureInit(), /获取 WBI 密钥失败/)
})

test('ensureInit：惰性初始化只请求一次', async () => {
  const counter = { calls: 0 }
  const signer = new WbiSigner(
    makeNavMock(`https://i0.hdslb.com/bfs/wbi/${IMG_KEY}.png`, `https://i0.hdslb.com/bfs/wbi/${SUB_KEY}.png`, counter) as never,
  )
  await signer.ensureInit()
  await signer.ensureInit()
  assert.equal(counter.calls, 1)
})
