// 分P 构造逻辑单测：条目生成 / 标题策略 / 切换分P
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPartTrack, buildPartTrackFrom, buildPartTracks } from '../src/shared/video-parts.ts'
import type { Track, VideoInfo } from '../src/shared/types.ts'

const info = (pages: { cid: number; part: string; duration: number }[]): VideoInfo => ({
  bvid: 'BV1TEST',
  aid: 123,
  cid: pages[0]?.cid ?? 0,
  title: '【合集】100 首经典歌曲',
  coverUrl: 'https://img/cover.jpg',
  duration: pages.reduce((s, p) => s + p.duration, 0),
  artist: '某UP主',
  pages: pages.map((p) => ({ cid: p.cid, part: p.part, duration: p.duration })),
})

const MULTI = info([
  { cid: 11, part: 'P1 晴天 - 周杰伦', duration: 240 },
  { cid: 22, part: 'P2 稻香 - 周杰伦', duration: 200 },
  { cid: 33, part: 'P3 七里香 - 周杰伦', duration: 180 },
])

test('buildPartTracks 每个分P 生成一条，id 按 cid 区分', () => {
  const tracks = buildPartTracks(MULTI)
  assert.equal(tracks.length, 3)
  assert.deepEqual(
    tracks.map((t) => t.id),
    ['BV1TEST_11', 'BV1TEST_22', 'BV1TEST_33'],
  )
  assert.deepEqual(
    tracks.map((t) => t.cid),
    [11, 22, 33],
  )
})

test('多P 视频用分P标题做条目主标题，主标题另存', () => {
  const t = buildPartTrack(MULTI, 1)
  assert.equal(t.title, 'P2 稻香 - 周杰伦')
  assert.equal(t.videoTitle, '【合集】100 首经典歌曲')
  assert.equal(t.partIndex, 1)
  assert.equal(t.partTitle, 'P2 稻香 - 周杰伦')
})

test('单P 视频不写分P 字段，标题保持主标题', () => {
  const single = info([{ cid: 7, part: '单P标题', duration: 100 }])
  const t = buildPartTrack(single, 0)
  assert.equal(t.title, '【合集】100 首经典歌曲')
  assert.equal(t.partIndex, undefined)
  assert.equal(t.partTitle, undefined)
  assert.equal(t.videoTitle, undefined)
})

test('没有分P 信息时退化成主条目一条', () => {
  const none = { ...info([]), pages: [] }
  const tracks = buildPartTracks(none)
  assert.equal(tracks.length, 1)
  assert.equal(tracks[0].title, '【合集】100 首经典歌曲')
  assert.equal(tracks[0].cid, none.cid)
})

test('buildPartTrackFrom 基于当前条目换分P：换 cid、清掉旧地址', () => {
  const base: Track = {
    id: 'BV1TEST_11',
    bvid: 'BV1TEST',
    cid: 11,
    title: 'P1 晴天 - 周杰伦',
    artist: '某UP主',
    coverUrl: 'https://img/cover.jpg',
    duration: 240,
    source: 'search',
    videoTitle: '【合集】100 首经典歌曲',
    partIndex: 0,
    partTitle: 'P1 晴天 - 周杰伦',
    audioUrl: 'https://cdn/old.m4s',
  }
  const next = buildPartTrackFrom(base, { cid: 22, part: 'P2 稻香 - 周杰伦', duration: 200 }, 1, 3)
  assert.equal(next.id, 'BV1TEST_22')
  assert.equal(next.cid, 22)
  assert.equal(next.duration, 200)
  assert.equal(next.title, 'P2 稻香 - 周杰伦')
  assert.equal(next.partIndex, 1)
  assert.equal(next.videoTitle, '【合集】100 首经典歌曲')
  assert.equal(next.audioUrl, undefined, '换了 cid 后旧播放地址必须清掉')
})

test('buildPartTrackFrom 分P 列表长度为 1 时按普通条目处理', () => {
  const base: Track = {
    id: 'BV1TEST_7',
    bvid: 'BV1TEST',
    cid: 7,
    title: '原标题',
    artist: '某UP主',
    coverUrl: '',
    duration: 100,
    source: 'search',
    partIndex: 0,
  }
  const next = buildPartTrackFrom(base, { cid: 7, part: '同名', duration: 100 }, 0, 1)
  assert.equal(next.title, '原标题')
  assert.equal(next.partIndex, undefined)
  assert.equal(next.videoTitle, undefined)
})
