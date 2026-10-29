// database.ts 初始化测试：initDatabase 幂等、WAL、getDb 集成
// 注意：database.ts 的 db 为文件级单例，本文件仅有一个测试会调用 initDatabase。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { initDatabase, getDb, applySchema } from '../src/main/db/database.ts'

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

test('applySchema: 老库缺列时自动补上 play_history.duration', () => {
  const db = new DatabaseSync(':memory:')
  try {
    // 模拟老版本建出来的表（没有 duration 列）
    db.exec(`
      CREATE TABLE play_history (
        track_id  TEXT PRIMARY KEY,
        bvid      TEXT NOT NULL,
        cid       INTEGER NOT NULL DEFAULT 0,
        title     TEXT NOT NULL DEFAULT '',
        artist    TEXT NOT NULL DEFAULT '',
        cover_url TEXT NOT NULL DEFAULT '',
        played_at INTEGER NOT NULL
      );
    `)
    applySchema(db)
    const cols = db.prepare('PRAGMA table_info(play_history)').all() as unknown as {
      name: string
    }[]
    assert.ok(
      cols.some((c) => c.name === 'duration'),
      '迁移后应补出 duration 列',
    )
    // 补列后能正常写入带时长的记录
    db.prepare(
      `INSERT INTO play_history (track_id, bvid, cid, title, artist, cover_url, duration, played_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('t1', 'BV1', 1, '标题', '歌手', '', 268, 1)
    const row = db.prepare('SELECT duration FROM play_history WHERE track_id = ?').get('t1') as {
      duration: number
    }
    assert.equal(row.duration, 268)

    // 重复执行不应报错（幂等）
    applySchema(db)
    const cols2 = db.prepare('PRAGMA table_info(play_history)').all() as unknown as {
      name: string
    }[]
    assert.equal(
      cols2.filter((c) => c.name === 'duration').length,
      1,
      '重复迁移不应出现重复列',
    )
  } finally {
    db.close()
  }
})

test('applySchema: 老库补出分P 相关列（playlist_tracks 与 play_history）', () => {
  const db = new DatabaseSync(':memory:')
  try {
    // 模拟老版本：两张表都没有分P 列
    db.exec(`
      CREATE TABLE playlist_tracks (
        playlist_id TEXT NOT NULL,
        track_id    TEXT NOT NULL,
        bvid        TEXT NOT NULL,
        cid         INTEGER NOT NULL DEFAULT 0,
        aid         INTEGER,
        title       TEXT NOT NULL DEFAULT '',
        artist      TEXT NOT NULL DEFAULT '',
        cover_url   TEXT NOT NULL DEFAULT '',
        duration    INTEGER NOT NULL DEFAULT 0,
        source      TEXT NOT NULL,
        position    INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (playlist_id, track_id)
      );
      CREATE TABLE play_history (
        track_id  TEXT PRIMARY KEY,
        bvid      TEXT NOT NULL,
        cid       INTEGER NOT NULL DEFAULT 0,
        title     TEXT NOT NULL DEFAULT '',
        artist    TEXT NOT NULL DEFAULT '',
        cover_url TEXT NOT NULL DEFAULT '',
        played_at INTEGER NOT NULL
      );
    `)
    applySchema(db)
    for (const table of ['playlist_tracks', 'play_history']) {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[]
      const names = cols.map((c) => c.name)
      for (const col of ['part_index', 'part_title', 'video_title']) {
        assert.ok(names.includes(col), `${table} 应补出 ${col} 列`)
      }
    }
    // 补列后能正常写入带分P 信息的记录
    db.prepare(
      `INSERT INTO playlist_tracks
        (playlist_id, track_id, bvid, cid, title, artist, cover_url, duration, source, position,
         part_index, part_title, video_title)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('pl1', 'BV1_222', 'BV1', 222, '下', 'UP主', '', 100, 'search', 0, 1, '下', '【合集】')
    const row = db
      .prepare('SELECT part_index, part_title, video_title FROM playlist_tracks WHERE track_id = ?')
      .get('BV1_222') as { part_index: number; part_title: string; video_title: string }
    assert.equal(row.part_index, 1)
    assert.equal(row.part_title, '下')
    assert.equal(row.video_title, '【合集】')
  } finally {
    db.close()
  }
})
