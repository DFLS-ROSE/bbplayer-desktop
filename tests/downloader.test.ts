// 下载相关纯函数单测：文件名净化 / 文件名拼装
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFileName, sanitizeFileName } from '../src/shared/download-filename.ts'

test('sanitizeFileName 去掉 Windows 非法字符', () => {
  assert.equal(sanitizeFileName('a<b>c:d"e/f\\g|h?i*j'), 'a_b_c_d_e_f_g_h_i_j')
  // 控制字符也要换掉
  assert.equal(sanitizeFileName('歌\x00曲\x1f名'), '歌_曲_名')
})

test('sanitizeFileName 折叠空白并去掉结尾的点与空格', () => {
  assert.equal(sanitizeFileName('  晴天   周杰伦  '), '晴天 周杰伦')
  assert.equal(sanitizeFileName('文件名...'), '文件名')
  assert.equal(sanitizeFileName('文件名. '), '文件名')
})

test('sanitizeFileName 空输入兜底为 unknown', () => {
  assert.equal(sanitizeFileName(''), 'unknown')
  assert.equal(sanitizeFileName('   '), 'unknown')
  assert.equal(sanitizeFileName('...'), 'unknown')
})

test('sanitizeFileName 限制长度', () => {
  const long = 'x'.repeat(300)
  assert.equal(sanitizeFileName(long).length, 120)
  assert.equal(sanitizeFileName(long, 50).length, 50)
})

test('buildFileName 拼成「歌手 - 标题.m4a」', () => {
  assert.equal(buildFileName('周杰伦', '晴天'), '周杰伦 - 晴天.m4a')
  // 歌手或标题里有非法字符时也要净化
  assert.equal(buildFileName('AC/DC', 'T.N.T?'), 'AC_DC - T.N.T_.m4a')
})
