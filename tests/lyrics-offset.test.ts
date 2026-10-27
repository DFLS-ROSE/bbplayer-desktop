// 歌词偏移纯函数单测：旧标签迁移 / 步长归一 / 展示格式
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clampOffset,
  formatOffset,
  readOffsetTagSec,
  stripOffsetTag,
} from '../src/shared/lyrics-offset.ts'

test('stripOffsetTag 去掉旧缓存的 [offset:] 标签（避免双重偏移）', () => {
  assert.equal(stripOffsetTag('[offset:500]\n[00:01.00]歌词'), '[00:01.00]歌词')
  assert.equal(stripOffsetTag('[offset:-1200]\n[00:01.00]歌词'), '[00:01.00]歌词')
  assert.equal(stripOffsetTag('[offset: 300]\n[00:01.00]歌词'), '[00:01.00]歌词')
  assert.equal(stripOffsetTag('[00:01.00]歌词'), '[00:01.00]歌词')
})

test('readOffsetTagSec 把毫秒换算为秒，支持负数与空格', () => {
  assert.equal(readOffsetTagSec('[offset:500]'), 0.5)
  assert.equal(readOffsetTagSec('[offset:-1200]'), -1.2)
  assert.equal(readOffsetTagSec('[offset: 300]'), 0.3)
  assert.equal(readOffsetTagSec('[00:01.00]没有标签'), 0)
})

test('clampOffset 归一到 0.1 秒步长并限制在 ±10 秒', () => {
  assert.equal(clampOffset(0.34), 0.3)
  assert.equal(clampOffset(-0.36), -0.4)
  assert.equal(clampOffset(12), 10)
  assert.equal(clampOffset(-99), -10)
  assert.equal(clampOffset(Number.NaN), 0)
})

test('formatOffset 展示为正负一位小数，接近 0 显示 ±0.0s', () => {
  assert.equal(formatOffset(0), '±0.0s')
  assert.equal(formatOffset(0.04), '±0.0s')
  assert.equal(formatOffset(0.5), '+0.5s')
  assert.equal(formatOffset(-1.2), '-1.2s')
})
