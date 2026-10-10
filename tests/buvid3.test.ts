// Buvid3Manager 单元测试：ensure() 同时持久化 buvid3(b_3) + buvid4(b_4)、Cookie 组装
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Buvid3Manager } from '../src/main/bilibili/buvid3.ts'

interface StoreState {
  b3: string
  b4: string
}

function makeStore(initial: Partial<StoreState> = {}): {
  getBuvid3: () => string
  setBuvid3: (v: string) => void
  getBuvid4: () => string
  setBuvid4: (v: string) => void
  state: StoreState
} {
  const state: StoreState = { b3: initial.b3 ?? '', b4: initial.b4 ?? '' }
  return {
    getBuvid3: () => state.b3,
    setBuvid3: (v) => {
      state.b3 = v
    },
    getBuvid4: () => state.b4,
    setBuvid4: (v) => {
      state.b4 = v
    },
    state,
  }
}

function makeHttp(b3?: string, b4?: string, calls?: { n: number }) {
  return {
    getRaw: async () => {
      calls && (calls.n += 1)
      return { code: 0, data: { b_3: b3, b_4: b4 } }
    },
  }
}

test('ensure: b_3 与 b_4 同时存在时，分别写入 buvid3/buvid4 并返回 b_3', async () => {
  const store = makeStore()
  const calls = { n: 0 }
  const mgr = new Buvid3Manager(store as never, makeHttp('B3_VALUE', 'B4_VALUE', calls) as never)
  const value = await mgr.ensure()
  assert.equal(value, 'B3_VALUE')
  assert.equal(store.state.b3, 'B3_VALUE')
  assert.equal(store.state.b4, 'B4_VALUE')
  assert.equal(calls.n, 1)
})

test('ensure: 仅返回 b_4 时兜底写入 buvid3 并同时写入 buvid4', async () => {
  const store = makeStore()
  const mgr = new Buvid3Manager(store as never, makeHttp(undefined, 'B4_ONLY') as never)
  const value = await mgr.ensure()
  assert.equal(value, 'B4_ONLY')
  assert.equal(store.state.b3, 'B4_ONLY')
  assert.equal(store.state.b4, 'B4_ONLY')
})

test('ensure: 已有 buvid3 且已有 buvid4 时直接返回，不重复请求', async () => {
  const store = makeStore({ b3: 'EXISTING_B3', b4: 'EXISTING_B4' })
  const calls = { n: 0 }
  const mgr = new Buvid3Manager(store as never, makeHttp('NEW_B3', 'NEW_B4', calls) as never)
  const value = await mgr.ensure()
  assert.equal(value, 'EXISTING_B3')
  assert.equal(calls.n, 0, '双值齐全不应再请求 spi')
  assert.equal(store.state.b3, 'EXISTING_B3')
  assert.equal(store.state.b4, 'EXISTING_B4')
})

test('ensure: 已有 buvid3 但无 buvid4 时发一次请求回填 buvid4，且不覆盖 buvid3', async () => {
  const store = makeStore({ b3: 'EXISTING_B3' })
  const calls = { n: 0 }
  const mgr = new Buvid3Manager(store as never, makeHttp('NEW_B3', 'NEW_B4', calls) as never)
  const value = await mgr.ensure()
  assert.equal(value, 'EXISTING_B3')
  assert.equal(calls.n, 1, '缺 buvid4 时应请求一次 spi 回填')
  assert.equal(store.state.b3, 'EXISTING_B3', '已有 buvid3 不应被覆盖')
  assert.equal(store.state.b4, 'NEW_B4')
})

test('getCookieHeader: 按 buvid3=..; buvid4=.. 组装', () => {
  const store = makeStore({ b3: 'B3_VALUE', b4: 'B4_VALUE' })
  const mgr = new Buvid3Manager(store as never, makeHttp() as never)
  assert.equal(mgr.getCookieHeader(), 'buvid3=B3_VALUE; buvid4=B4_VALUE')
})

test('getCookieHeader: 仅 buvid3 时只输出 buvid3', () => {
  const store = makeStore({ b3: 'B3_VALUE' })
  const mgr = new Buvid3Manager(store as never, makeHttp() as never)
  assert.equal(mgr.getCookieHeader(), 'buvid3=B3_VALUE')
})
