// BiliApi.search 响应解析单元测试：字段路径 / 映射 / total / hasMore / 空结果
//
// 背景：B 站搜索接口真实返回结构为
//   { code:0, data:{ numResults, result:[{ bvid, aid, title, author, pic, duration, ... }] } }
// 且 HttpClient.get() 会校验 code===0 并解包返回 data.data 这一层（即 search() 拿到的
// 是 `{ numResults, result }`）。本文件直接 mock http.get 返回该层结构。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BiliApi, parseDuration } from '../src/main/bilibili/api.ts'

interface MockResultItem {
  type?: string
  bvid?: string
  aid?: number
  title?: string
  author?: string
  pic?: string
  duration?: number | string
}

interface MockSearchResponse {
  numResults?: number
  result?: MockResultItem[]
}

function makeResultItem(overrides: MockResultItem = {}): MockResultItem {
  return {
    type: 'video',
    bvid: 'BV1GJ411x7h7',
    aid: 170001,
    title: '晴天',
    author: '周杰伦',
    pic: 'https://i0.hdslb.com/bfs/archive/cover.jpg',
    duration: '3:45',
    ...overrides,
  }
}

function makeResultList(count: number): MockResultItem[] {
  return Array.from({ length: count }, (_, i) =>
    makeResultItem({
      bvid: `BV1TEST${String(i).padStart(3, '0')}`,
      title: `标题${i}`,
      duration: 100 + i,
    }),
  )
}

function makeApi(response: MockSearchResponse, calls?: { get: unknown[]; ensure: number }) {
  const http = {
    get: async (...args: unknown[]) => {
      calls?.get.push(args)
      return response
    },
  }
  const buvid3 = {
    ensure: async () => {
      if (calls) calls.ensure += 1
      return 'buvid3-value'
    },
  }
  const resolver = {}
  return new BiliApi(http as never, buvid3 as never, resolver as never)
}

// —— parseDuration 基础行为 ——
test('parseDuration: "3:45" 字符串解析为秒', () => {
  assert.equal(parseDuration('3:45'), 225)
})

test('parseDuration: number 直接透传', () => {
  assert.equal(parseDuration(200), 200)
})

test('parseDuration: 非法输入返回 0', () => {
  assert.equal(parseDuration('abc'), 0)
  assert.equal(parseDuration(undefined), 0)
  assert.equal(parseDuration(NaN), 0)
})

// —— search 主流程 ——
test('search: 返回 items 数量与 result 数组一致', async () => {
  const result = makeResultList(20)
  const api = makeApi({ numResults: 1000, result })
  const res = await api.search('周杰伦', 1)
  assert.equal(res.items.length, 20)
})

test('search: items[0] 字段映射正确', async () => {
  const first = makeResultItem({
    bvid: 'BV1GJ411x7h7',
    aid: 170001,
    title: '晴天',
    author: '周杰伦',
    pic: 'https://i0.hdslb.com/bfs/archive/cover.jpg',
    duration: '3:45',
  })
  const api = makeApi({ numResults: 1000, result: [first] })
  const res = await api.search('周杰伦', 1)
  const item = res.items[0]
  assert.equal(item.id, 'BV1GJ411x7h7_0')
  assert.equal(item.bvid, 'BV1GJ411x7h7')
  assert.equal(item.cid, 0)
  assert.equal(item.aid, 170001)
  assert.equal(item.title, '晴天')
  assert.equal(item.artist, '周杰伦')
  assert.equal(item.coverUrl, 'https://i0.hdslb.com/bfs/archive/cover.jpg')
  assert.equal(item.duration, 225)
  assert.equal(item.source, 'search')
})

test('search: total 取 numResults，hasMore 按 page*20 < total 判定', async () => {
  const result = makeResultList(20)
  const api = makeApi({ numResults: 1000, result })

  const page1 = await api.search('周杰伦', 1)
  assert.equal(page1.total, 1000)
  assert.equal(page1.hasMore, true)

  const page49 = await api.search('周杰伦', 49) // 49*20=980 < 1000
  assert.equal(page49.hasMore, true)

  const page50 = await api.search('周杰伦', 50) // 50*20=1000，不满足 <
  assert.equal(page50.hasMore, false)
})

test('search: duration 为 number 时直接透传', async () => {
  const api = makeApi({ numResults: 1, result: [makeResultItem({ duration: 200 })] })
  const res = await api.search('周杰伦', 1)
  assert.equal(res.items[0].duration, 200)
})

test('search: 空 result 不抛错，items=[]', async () => {
  const api = makeApi({ numResults: 0, result: [] })
  const res = await api.search('不存在的关键词', 1)
  assert.deepEqual(res.items, [])
  assert.equal(res.total, 0)
  assert.equal(res.hasMore, false)
})

test('search: 接口未返回 result 字段时不抛错，items=[]', async () => {
  const api = makeApi({ numResults: 0 })
  const res = await api.search('周杰伦', 1)
  assert.deepEqual(res.items, [])
  assert.equal(res.total, 0)
})

test('search: 过滤缺失 bvid 的条目', async () => {
  const result = [makeResultItem({ bvid: 'BV1GOOD0001' }), makeResultItem({ bvid: undefined })]
  const api = makeApi({ numResults: 2, result })
  const res = await api.search('周杰伦', 1)
  assert.equal(res.items.length, 1)
  assert.equal(res.items[0].bvid, 'BV1GOOD0001')
})

test('search: 以 wbi:true 调用 http.get 且先 ensure buvid3', async () => {
  const calls = { get: [] as unknown[], ensure: 0 }
  const api = makeApi({ numResults: 0, result: [] }, calls)
  await api.search('周杰伦', 2)

  assert.equal(calls.ensure, 1, 'search 应先调用 buvid3.ensure()')
  assert.equal(calls.get.length, 1)
  const [url, params, opts] = calls.get[0] as [string, Record<string, unknown>, { wbi?: boolean }]
  assert.ok(url.includes('/x/web-interface/search/type'), `url 应指向搜索接口，实际 ${url}`)
  assert.equal(params.keyword, '周杰伦')
  assert.equal(params.search_type, 'video')
  assert.equal(params.page, 2)
  assert.equal(params.page_size, 20)
  assert.equal(opts.wbi, true)
})
