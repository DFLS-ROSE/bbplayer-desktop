// database.ts 初始化测试：initDatabase 幂等、WAL、getDb 集成
// 注意：database.ts 的 db 为文件级单例，本文件仅有一个测试会调用 initDatabase。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initDatabase, getDb } from '../src/main/db/database.ts'

test('initDatabase: 重复调用返回同一实例、建表完整、WAL 生效', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbplayer-db-'))
  const db1 = initDatabase(dir)
  try {
    const db2 = initDatabase(dir)
    assert.equal(db1, db2, '重复调用应返回缓存的同一实例')
    assert.equal(getDb(), db1, 'getDb 应返回 initDatabase 创建的实例')

    const tables = db1
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[]
    const names = tables.map((t) => t.name)
    for (const expected of ['playlists', 'playlist_tracks', 'play_history', 'playback_progress']) {
      assert.ok(names.includes(expected), `应包含表 ${expected}`)
    }

    const pragma = db1.prepare('PRAGMA journal_mode').get() as { journal_mode: string }
    assert.equal(pragma.journal_mode, 'wal', '文件库应处于 WAL 模式')
  } finally {
    db1.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
