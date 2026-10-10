// 歌词解析器单元测试：LRC / SPL / 翻译罗马音 / 容错
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findCurrentLineIndex, parseLyric } from '../src/renderer/src/lyrics/lyrics-parser.ts'

test('标准 LRC 解析：多行时间标签与文本', () => {
  const raw = '[00:00.00]第一句\n[00:10.50]第二句\n[00:20.00]第三句'
  const data = parseLyric(raw)
  assert.equal(data.type, 'lrc')
  assert.equal(data.lines.length, 3)
  assert.equal(data.lines[0].time, 0)
  assert.equal(data.lines[0].text, '第一句')
  assert.equal(data.lines[1].time, 10.5)
  assert.equal(data.lines[1].text, '第二句')
  assert.equal(data.lines[2].time, 20)
  assert.equal(data.lines[2].text, '第三句')
  assert.equal(data.offset, 0)
  assert.equal(data.source, 'manual')
})

test('source 覆盖为传入值', () => {
  const data = parseLyric('[00:01.00]hi', { source: 'netease' })
  assert.equal(data.source, 'netease')
})

test('一行多个时间标签会展开为多行', () => {
  const data = parseLyric('[00:00.00][01:00.00]重复句')
  assert.equal(data.lines.length, 2)
  assert.equal(data.lines[0].time, 0)
  assert.equal(data.lines[1].time, 60)
  assert.equal(data.lines[0].text, '重复句')
  assert.equal(data.lines[1].text, '重复句')
})

test('SPL 逐字歌词解析：type 为 spl 且拆出 words', () => {
  const raw = '[00:00.00]<00:00.00>你<00:00.50>好<00:01.00>世<00:01.50>界'
  const data = parseLyric(raw)
  assert.equal(data.type, 'spl')
  assert.equal(data.lines.length, 1)
  assert.equal(data.lines[0].text, '你好世界')
  assert.ok(data.lines[0].words)
  assert.equal(data.lines[0].words!.length, 4)
  assert.equal(data.lines[0].words![0].time, 0)
  assert.equal(data.lines[0].words![0].text, '你')
  assert.equal(data.lines[0].words![1].time, 0.5)
  assert.equal(data.lines[0].words![1].text, '好')
  assert.equal(data.lines[0].words![3].time, 1.5)
  assert.equal(data.lines[0].words![3].text, '界')
})

test('SPL 三位分钟边界：100 分钟 SPL 正确识别为 spl 并逐字解析', () => {
  const raw = '[100:00]<100:00.00>字<100:00.50>词'
  const data = parseLyric(raw)
  assert.equal(data.type, 'spl')
  assert.equal(data.lines.length, 1)
  assert.equal(data.lines[0].time, 6000)
  assert.equal(data.lines[0].text, '字词')
  assert.ok(data.lines[0].words)
  assert.equal(data.lines[0].words!.length, 2)
  assert.equal(data.lines[0].words![0].time, 6000)
  assert.equal(data.lines[0].words![0].text, '字')
  assert.equal(data.lines[0].words![1].time, 6000.5)
  assert.equal(data.lines[0].words![1].text, '词')
})

test('翻译与罗马音行按时间戳挂载', () => {
  const raw = '[00:00.00]你好\n[00:10.00]世界'
  const data = parseLyric(raw, {
    translation: '[00:00.00]Hello\n[00:10.00]World',
    roman: '[00:00.00]ni hao\n[00:10.00]shi jie',
  })
  assert.equal(data.lines[0].translation, 'Hello')
  assert.equal(data.lines[0].roman, 'ni hao')
  assert.equal(data.lines[1].translation, 'World')
  assert.equal(data.lines[1].roman, 'shi jie')
})

test('空行、元数据行与无时间戳行被容错跳过', () => {
  const raw = '[ti:标题]\n[ar:歌手]\n\n[00:05.00]有效行\n这行没有时间戳'
  const data = parseLyric(raw)
  assert.equal(data.lines.length, 1)
  assert.equal(data.lines[0].time, 5)
  assert.equal(data.lines[0].text, '有效行')
})

test('分数秒与整数秒解析', () => {
  assert.equal(parseLyric('[01:02]整秒').lines[0].time, 62)
  assert.equal(parseLyric('[01:02.50]两位毫秒').lines[0].time, 62.5)
  assert.equal(parseLyric('[01:02.5]一位毫秒').lines[0].time, 62.5)
  assert.equal(parseLyric('[100:00]三位分钟').lines[0].time, 6000)
})

test('findCurrentLineIndex：定位当前行下标', () => {
  const lines = parseLyric('[00:00.00]a\n[00:10.00]b\n[00:20.00]c').lines
  assert.equal(findCurrentLineIndex(lines, -1), -1)
  assert.equal(findCurrentLineIndex(lines, 0), 0)
  assert.equal(findCurrentLineIndex(lines, 15), 1)
  assert.equal(findCurrentLineIndex(lines, 20), 2)
  assert.equal(findCurrentLineIndex(lines, 25), 2)
  assert.equal(findCurrentLineIndex([], 5), -1)
})

test('offset 平移：通过 position+offset 选择行（组件层偏移）', () => {
  const lines = parseLyric('[00:00.00]a\n[00:10.00]b\n[00:20.00]c').lines
  const offset = -0.5
  // 播放到 10.4s，但歌词整体提前 0.5s → 仍应命中 b 行
  assert.equal(findCurrentLineIndex(lines, 10.4 + offset), 0)
  assert.equal(findCurrentLineIndex(lines, 10.5 + offset), 1)
})
