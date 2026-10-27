// 播放源候选列表单测：顺序 / 去重 / 空值过滤
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSourceList, hostOf } from '../src/shared/media-sources.ts'

test('buildSourceList 主地址在最前，备用地址保序跟在后面', () => {
  const list = buildSourceList('https://a.com/x.m4s', [
    'https://b.com/x.m4s',
    'https://c.com/x.m4s',
  ])
  assert.deepEqual(list, ['https://a.com/x.m4s', 'https://b.com/x.m4s', 'https://c.com/x.m4s'])
})

test('buildSourceList 去掉空值、null 与重复地址', () => {
  const list = buildSourceList('https://a.com/x.m4s', [
    '',
    null,
    undefined,
    '  ',
    'https://a.com/x.m4s',
    'https://b.com/x.m4s',
    'https://b.com/x.m4s',
  ])
  assert.deepEqual(list, ['https://a.com/x.m4s', 'https://b.com/x.m4s'])
})

test('buildSourceList 只有备用地址时也能返回候选', () => {
  assert.deepEqual(buildSourceList(undefined, ['https://b.com/x.m4s']), ['https://b.com/x.m4s'])
  assert.deepEqual(buildSourceList(undefined, []), [])
  assert.deepEqual(buildSourceList('', null), [])
})

test('hostOf 取主机名，非法地址返回空串', () => {
  assert.equal(hostOf('https://omvv62x.edge.mountaintoys.cn:4483/a/b.m4s'), 'omvv62x.edge.mountaintoys.cn')
  assert.equal(hostOf('not a url'), '')
  assert.equal(hostOf(''), '')
})
