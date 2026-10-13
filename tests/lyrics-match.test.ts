// 歌词匹配逻辑单元测试：标题清洗 / 候选评分 / 歌词有效性
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanTitle, isValidLyric, scoreCandidate } from '../src/main/lyrics/lyrics-service.ts'

test('cleanTitle 去掉方括号修饰并归一分隔符', () => {
  assert.equal(cleanTitle('【4K修复】周杰伦 - 晴天'), '周杰伦 晴天')
})

test('cleanTitle 去掉圆括号 live 标记', () => {
  assert.equal(cleanTitle('晴天 - 周杰伦 (Live)'), '晴天 周杰伦')
})

test('cleanTitle 书名号归一为空格', () => {
  assert.equal(cleanTitle('周杰伦《晴天》'), '周杰伦 晴天')
})

test('cleanTitle 去掉分辨率与视频修饰词', () => {
  const r = cleanTitle('【1080P 60帧】晴天 周杰伦 完整版')
  assert.equal(r, '晴天 周杰伦')
})

test('cleanTitle 中文竖线分隔符归一', () => {
  assert.equal(cleanTitle('周杰伦 | 晴天'), '周杰伦 晴天')
})

test('scoreCandidate 原版得分高于翻唱变体', () => {
  const exact = scoreCandidate({ title: '晴天', artist: '周杰伦' }, '【4K修复】周杰伦 - 晴天', '周杰伦')
  const variant = scoreCandidate({ title: '晴天(深情版)', artist: '周杰伦' }, '【4K修复】周杰伦 - 晴天', '周杰伦')
  assert.ok(exact > variant, `原版(${exact})应高于变体(${variant})`)
})

test('scoreCandidate 完全无关候选得分最低', () => {
  const exact = scoreCandidate({ title: '晴天', artist: '周杰伦' }, '晴天', '周杰伦')
  const unrelated = scoreCandidate({ title: '稻香', artist: '周杰伦' }, '晴天', '周杰伦')
  assert.ok(exact > unrelated)
})

test('scoreCandidate 歌手匹配额外加分', () => {
  const withArtist = scoreCandidate({ title: '晴天', artist: '周杰伦' }, '晴天', '周杰伦')
  const withoutArtist = scoreCandidate({ title: '晴天', artist: '别人' }, '晴天', '周杰伦')
  assert.ok(withArtist > withoutArtist)
})

test('scoreCandidate 版本标记候选（夜曲 - A35）正确匹配原版', () => {
  const orig = scoreCandidate({ title: '夜曲 - A35', artist: '周杰伦' }, '周杰伦 - 夜曲')
  const cover = scoreCandidate({ title: '夜曲', artist: 'Xai小爱' }, '周杰伦 - 夜曲')
  assert.ok(orig > cover, `原版(${orig})应高于翻唱(${cover})`)
})

test('isValidLyric 识别有效 LRC', () => {
  assert.equal(isValidLyric('[00:12.00]歌词'), true)
  assert.equal(isValidLyric('[00:12]歌词'), true)
  assert.equal(isValidLyric('纯文本无时间标签'), false)
  assert.equal(isValidLyric(''), false)
})
