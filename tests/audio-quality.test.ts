// 音轨挑选单测：AAC 过滤 / 各档位选择 / 兜底顺序
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AUDIO_QUALITY_OPTIONS,
  isPlayableAudio,
  pickAudioTrack,
  type AudioTrackLike,
} from '../src/shared/audio-quality.ts'

const t = (id: number, bandwidth: number, codecs: string): AudioTrackLike => ({
  id,
  bandwidth,
  codecs,
  baseUrl: `https://cdn.example/${id}.m4s`,
})

/** 典型响应：64K / 132K / 192K AAC，外加杜比与无损（Chromium 解不了） */
const TYPICAL: AudioTrackLike[] = [
  t(30216, 64_000, 'mp4a.40.2'),
  t(30232, 132_000, 'mp4a.40.2'),
  t(30280, 192_000, 'mp4a.40.2'),
  t(30250, 448_000, 'ec-3'),
  t(30251, 1_400_000, 'fLaC'),
]

test('isPlayableAudio 只认 AAC，杜比与无损判为不可播', () => {
  assert.equal(isPlayableAudio(t(30280, 192_000, 'mp4a.40.2')), true)
  assert.equal(isPlayableAudio(t(30250, 448_000, 'ec-3')), false)
  assert.equal(isPlayableAudio(t(30251, 1_400_000, 'fLaC')), false)
})

test('isPlayableAudio 无 codecs 时按 id 兜底判断', () => {
  assert.equal(isPlayableAudio({ id: 30280, baseUrl: 'x' }), true)
  assert.equal(isPlayableAudio({ id: 30250, baseUrl: 'x' }), false)
  assert.equal(isPlayableAudio({ id: 30251, baseUrl: 'x' }), false)
})

test('auto 取最高 AAC，绝不选杜比/无损', () => {
  const picked = pickAudioTrack(TYPICAL, 'auto')
  assert.equal(picked?.track.id, 30280)
  assert.equal(picked?.label, '192K')
})

test('high / medium / low 分别命中 192K / 132K / 64K', () => {
  assert.equal(pickAudioTrack(TYPICAL, 'high')?.label, '192K')
  assert.equal(pickAudioTrack(TYPICAL, 'medium')?.label, '132K')
  assert.equal(pickAudioTrack(TYPICAL, 'low')?.label, '64K')
})

test('目标档位不存在时取「不超过目标」的最高档', () => {
  // 只有 64K 与 192K，选 medium(132K) 应退到 64K 而不是跳到 192K
  const sparse: AudioTrackLike[] = [t(30216, 64_000, 'mp4a.40.2'), t(30280, 192_000, 'mp4a.40.2')]
  assert.equal(pickAudioTrack(sparse, 'medium')?.label, '64K')
  // 只有 192K 时选 low 只能给 192K（没有更低的可选）
  assert.equal(pickAudioTrack([t(30280, 192_000, 'mp4a.40.2')], 'low')?.label, '192K')
})

test('没有 AAC 轨时退回全部候选，而不是直接返回 null', () => {
  const onlyDolby: AudioTrackLike[] = [t(30250, 448_000, 'ec-3'), t(30251, 1_400_000, 'fLaC')]
  const picked = pickAudioTrack(onlyDolby, 'auto')
  assert.ok(picked)
  assert.equal(picked?.track.id, 30251)
})

test('pickAudioTrack 对空输入与缺地址的条目返回 null', () => {
  assert.equal(pickAudioTrack([], 'auto'), null)
  assert.equal(pickAudioTrack(null, 'auto'), null)
  assert.equal(pickAudioTrack([{ id: 30280 }], 'auto'), null)
})

test('选项列表覆盖四档且默认值在列表内', () => {
  const values = AUDIO_QUALITY_OPTIONS.map((o) => o.value)
  assert.deepEqual(values, ['auto', 'high', 'medium', 'low'])
  assert.ok(values.includes('auto'))
})
