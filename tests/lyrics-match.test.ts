// 歌词匹配逻辑单元测试：标题清洗 / 候选评分 / 歌词有效性
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildKeywordSets,
  cleanTitle,
  isUsableLyric,
  isValidLyric,
  scoreCandidate,
} from '../src/main/lyrics/lyrics-service.ts'
import {
  normalizeTitle,
  stripHtml,
  stripVersionSuffix,
  titlesMatch,
} from '../src/shared/text.ts'

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

// —— 回归：B 站搜索标题带 <em class="keyword">，入库前必须剥掉 ——
test('stripHtml 去掉搜索高亮标签与实体', () => {
  assert.equal(stripHtml('【4K】<em class="keyword">晴天</em> - 周杰伦'), '【4K】晴天 - 周杰伦')
  assert.equal(stripHtml('A &amp; B&#39;s'), "A & B's")
})

test('cleanTitle 可清洗带 <em> 高亮的搜索标题', () => {
  assert.equal(cleanTitle('【𝐇𝐢-𝐑𝐞𝐬】<em class="keyword">晴天</em> - 周杰伦'), '晴天 周杰伦')
})

test('buildKeywordSets 优先取书名号里的歌名', () => {
  const sets = buildKeywordSets('Taylor Swift《Lover》百万豪装录音棚大声听【Hi-res】')
  assert.equal(sets[0], 'Lover')
  assert.ok(sets.length <= 3)
})

test('buildKeywordSets 排除影视剧/番剧名', () => {
  const sets = buildKeywordSets('影视剧《尚公主》主题曲《蔷薇青竹》')
  assert.ok(sets.includes('蔷薇青竹'))
  assert.ok(!sets.includes('尚公主'))
})

// —— 回归：目标标题不能做截断式清洗（旧实现被 "𝐇𝐢-𝐑𝐞𝐬" 的连字符整段截掉）——
test('titlesMatch 长 B 站标题与短歌名可匹配（含连字符/全角竖线）', () => {
  assert.equal(titlesMatch('Love Story', '【𝐇𝐢-𝐑𝐞𝐬无损音质】｜《Love Story》- Taylor Swift -'), true)
  assert.equal(titlesMatch('晴天', '【4K修复】周杰伦 - 晴天'), true)
  assert.equal(titlesMatch('晴天', '【4K修复】周杰伦 - 稻香'), false)
})

test('normalizeTitle 覆盖全角标点与符号', () => {
  assert.equal(normalizeTitle('A｜B～C×D'), 'abcd')
})

test('stripVersionSuffix 去掉候选的版本标记', () => {
  assert.equal(stripVersionSuffix('夜曲 - A35'), '夜曲')
  assert.equal(stripVersionSuffix('Love Story (DJ版)'), 'Love Story')
})

// —— 回归：酷狗把「纯音乐/占位歌词」排在前面，必须跳过 ——
test('isUsableLyric 拒绝酷狗占位歌词', () => {
  assert.equal(isUsableLyric('[ti:track1]\n[ar:]\n', '蔷薇青竹'), false)
  assert.equal(isUsableLyric('[ti:蔷薇青竹]\n[00:01.00]词\n[00:02.00]曲', '蔷薇青竹'), true)
})

test('isUsableLyric 歌名对不上时拒绝', () => {
  const lrc = '[ti:后来]\n[00:01.00]后来 我总算学会了'
  assert.equal(isUsableLyric(lrc, '晴天'), false)
  assert.equal(isUsableLyric(lrc, '后来'), true)
})

