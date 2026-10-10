// db 层（node:sqlite）仓储单元测试：歌单 / 历史 / 进度 CRUD、UPSERT 去重、事务回滚
//
// 注意：database.ts 的 migrate() 未导出（文件级单例），本文件内联一份与 database.ts
// migrate() 完全一致的建表 SQL，用于对内存库执行相同迁移。二者必须保持同步，若
// database.ts 的建表语句变更，需同步更新下方 SCHEMA。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import {
  PlaylistRepository,
  HistoryRepository,
  ProgressRepository,
  Repositories,
} from '../src/main/db/repositories.ts'
import type { Track, PlayHistoryEntry, PlaybackProgress } from '../src/shared/types.ts'

// 与 src/main/db/database.ts 的 migrate() 保持同步（CREATE TABLE IF NOT EXISTS）
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS playlists (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,
    source_id   TEXT,
    track_count INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS playlist_tracks (
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
  CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist
    ON playlist_tracks(playlist_id);

  CREATE TABLE IF NOT EXISTS play_history (
    track_id  TEXT PRIMARY KEY,
    bvid      TEXT NOT NULL,
    cid       INTEGER NOT NULL DEFAULT 0,
    title     TEXT NOT NULL DEFAULT '',
    artist    TEXT NOT NULL DEFAULT '',
    cover_url TEXT NOT NULL DEFAULT '',
    played_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS playback_progress (
    track_id   TEXT PRIMARY KEY,
    position   REAL NOT NULL DEFAULT 0,
    duration   REAL NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
`

function createDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec(SCHEMA)
  return db
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'bv1_cid1',
    bvid: 'BV1',
    cid: 1,
    title: '默认标题',
    artist: '默认歌手',
    coverUrl: '',
    duration: 100,
    source: 'local',
    ...overrides,
  }
}

function makeHistory(overrides: Partial<PlayHistoryEntry> = {}): PlayHistoryEntry {
  return {
    trackId: 't1',
    bvid: 'BV1',
    cid: 1,
    title: '标题',
    artist: '歌手',
    coverUrl: '',
    playedAt: 1,
    ...overrides,
  }
}

function makeProgress(overrides: Partial<PlaybackProgress> = {}): PlaybackProgress {
  return {
    trackId: 't1',
    position: 10,
    duration: 200,
    updatedAt: 1,
    ...overrides,
  }
}

// —— 建表幂等 ——
test('建表幂等：SCHEMA 重复 exec 不报错且表数量稳定', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(SCHEMA)
  db.exec(SCHEMA) // 第二次执行不应报错
  const row = db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table'").get() as { c: number }
  assert.equal(row.c, 4, '应包含 playlists/playlist_tracks/play_history/playback_progress 四张表')
})

// —— PlaylistRepository：create/get/update/delete/list ——
test('PlaylistRepository: create/get 往返字段一致', () => {
  const repo = new PlaylistRepository(createDb())
  const p = repo.create('我的歌单', 'local', 'src-1')
  assert.ok(p.id.startsWith('local_'), 'id 应以 type 为前缀')
  const got = repo.get(p.id)
  assert.ok(got)
  assert.equal(got.name, '我的歌单')
  assert.equal(got.type, 'local')
  assert.equal(got.sourceId, 'src-1')
  assert.equal(got.trackCount, 0)
  assert.equal(got.createdAt, got.updatedAt)
})

test('PlaylistRepository: create 不传 sourceId 时返回 undefined', () => {
  const repo = new PlaylistRepository(createDb())
  const p = repo.create('无源', 'favorite')
  assert.equal(repo.get(p.id)!.sourceId, undefined)
})

test('PlaylistRepository: update 改名；不存在的 id 返回 null', () => {
  const repo = new PlaylistRepository(createDb())
  const p = repo.create('a', 'local')
  const updated = repo.update(p.id, { name: 'b' })
  assert.ok(updated)
  assert.equal(updated.name, 'b')
  assert.equal(updated.id, p.id)
  assert.equal(repo.get(p.id)!.name, 'b')
  assert.equal(repo.update('不存在的id', { name: 'x' }), null)
})

test('PlaylistRepository: delete 删除歌单并级联清理 tracks', () => {
  const repo = new PlaylistRepository(createDb())
  const p = repo.create('a', 'local')
  repo.addTracks(p.id, [makeTrack({ id: 't1', bvid: 'BV1', cid: 1 })])
  assert.equal(repo.listTracks(p.id).length, 1)
  assert.equal(repo.delete(p.id), true)
  assert.equal(repo.get(p.id), null)
  assert.equal(repo.listTracks(p.id).length, 0, '删除歌单后 tracks 应被级联清理')
  assert.equal(repo.delete(p.id), false, '重复删除应返回 false')
})

test('PlaylistRepository: list 按 updated_at 降序 & type 过滤', () => {
  const db = createDb()
  const repo = new PlaylistRepository(db)
  const a = repo.create('a', 'local')
  const b = repo.create('b', 'favorite')
  const c = repo.create('c', 'local')
  // 手动固定 updated_at 以确定性验证排序（避免同一毫秒时间戳）
  db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(1000, a.id)
  db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(3000, b.id)
  db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(2000, c.id)

  assert.deepEqual(repo.list().map((p) => p.id), [b.id, c.id, a.id])
  assert.deepEqual(repo.list('local').map((p) => p.id).sort(), [a.id, c.id].sort())
  assert.deepEqual(repo.list('imported'), [])
})

// —— addTracks / removeTrack / listTracks / searchTracks ——
test('addTracks: 批量插入、position 递增、trackCount 刷新、追加续接 position', () => {
  const repo = new PlaylistRepository(createDb())
  const p = repo.create('a', 'local')
  const count = repo.addTracks(p.id, [
    makeTrack({ id: 't1', bvid: 'BV1', cid: 1, title: '一' }),
    makeTrack({ id: 't2', bvid: 'BV2', cid: 2, title: '二' }),
    makeTrack({ id: 't3', bvid: 'BV3', cid: 3, title: '三' }),
  ])
  assert.equal(count, 3)
  assert.deepEqual(repo.listTracks(p.id).map((t) => t.id), ['t1', 't2', 't3'])
  assert.equal(repo.get(p.id)!.trackCount, 3)

  // 追加时应从当前 trackCount 继续分配 position，顺序不变
  repo.addTracks(p.id, [makeTrack({ id: 't4', bvid: 'BV4', cid: 4, title: '四' })])
  assert.deepEqual(repo.listTracks(p.id).map((t) => t.id), ['t1', 't2', 't3', 't4'])
  assert.equal(repo.get(p.id)!.trackCount, 4)
})

test('addTracks: ON CONFLICT DO UPDATE 去重并更新元数据，不产生重复行', () => {
  const repo = new PlaylistRepository(createDb())
  const p = repo.create('a', 'local')
  repo.addTracks(p.id, [makeTrack({ id: 't1', bvid: 'BV1', cid: 1, title: '旧标题', duration: 100 })])
  const count = repo.addTracks(p.id, [makeTrack({ id: 't1', bvid: 'BV1', cid: 1, title: '新标题', duration: 999 })])
  assert.equal(count, 1, 'UPSERT 应报告 1 次变更')
  const tracks = repo.listTracks(p.id)
  assert.equal(tracks.length, 1, '同 (playlist_id, track_id) 不应产生重复行')
  assert.equal(tracks[0].title, '新标题')
  assert.equal(tracks[0].duration, 999)
  assert.equal(repo.get(p.id)!.trackCount, 1, 'trackCount 应保持为实际行数')
})

test('addTracks: 不存在的歌单返回 0 且不写入', () => {
  const repo = new PlaylistRepository(createDb())
  assert.equal(repo.addTracks('不存在的歌单', [makeTrack()]), 0)
})

test('removeTrack: 删除单曲并刷新 trackCount；重复删除返回 false', () => {
  const repo = new PlaylistRepository(createDb())
  const p = repo.create('a', 'local')
  repo.addTracks(p.id, [makeTrack({ id: 't1', bvid: 'BV1', cid: 1 }), makeTrack({ id: 't2', bvid: 'BV2', cid: 2 })])
  assert.equal(repo.removeTrack(p.id, 't1'), true)
  assert.equal(repo.removeTrack(p.id, 't1'), false)
  assert.equal(repo.get(p.id)!.trackCount, 1)
  assert.deepEqual(repo.listTracks(p.id).map((t) => t.id), ['t2'])
})

test('searchTracks: title/artist/bvid 模糊匹配', () => {
  const repo = new PlaylistRepository(createDb())
  const p = repo.create('a', 'local')
  repo.addTracks(p.id, [
    makeTrack({ id: 't1', bvid: 'BV100', cid: 1, title: '晴天', artist: '周杰伦' }),
    makeTrack({ id: 't2', bvid: 'BV200', cid: 2, title: '青花瓷', artist: '周杰伦' }),
    makeTrack({ id: 't3', bvid: 'BV300', cid: 3, title: '演员', artist: '薛之谦' }),
  ])
  assert.deepEqual(repo.searchTracks('周杰伦').map((t) => t.id).sort(), ['t1', 't2'])
  assert.deepEqual(repo.searchTracks('青花').map((t) => t.id), ['t2'])
  assert.deepEqual(repo.searchTracks('BV300').map((t) => t.id), ['t3'])
  assert.deepEqual(repo.searchTracks('不存在的关键词'), [])
})

// —— 事务回滚 ——
test('addTracks: 中途抛错时事务回滚，无半提交', () => {
  const repo = new PlaylistRepository(createDb())
  const p = repo.create('a', 'local')
  const bad = makeTrack({ id: 't2', bvid: 'BV2', cid: 2 })
  ;(bad as { bvid: unknown }).bvid = null // bvid NOT NULL → 插入第二条时触发约束错误
  assert.throws(() =>
    repo.addTracks(p.id, [makeTrack({ id: 't1', bvid: 'BV1', cid: 1 }), bad as Track]),
  )
  // 第一条（本应成功）也必须随事务回滚，不得残留
  assert.equal(repo.listTracks(p.id).length, 0, '回滚后不应残留任何 track')
  assert.equal(repo.get(p.id)!.trackCount, 0, '回滚后 trackCount 不应变化')
})

// —— HistoryRepository ——
test('HistoryRepository: add 返回 true；ON CONFLICT 更新而非新增', () => {
  const repo = new HistoryRepository(createDb())
  assert.equal(repo.add(makeHistory({ trackId: 't1', bvid: 'BV1', cid: 1, title: '旧' })), true)
  assert.equal(repo.add(makeHistory({ trackId: 't1', bvid: 'BV1', cid: 1, title: '新', playedAt: 2 })), true)
  assert.equal(repo.list().length, 1, '同 track_id 不应重复')
  assert.equal(repo.list()[0].title, '新')
  assert.equal(repo.list()[0].playedAt, 2)
})

test('HistoryRepository: list 按 played_at 降序并支持 limit', () => {
  const repo = new HistoryRepository(createDb())
  repo.add(makeHistory({ trackId: 't1', bvid: 'BV1', cid: 1, playedAt: 100 }))
  repo.add(makeHistory({ trackId: 't2', bvid: 'BV2', cid: 2, playedAt: 300 }))
  repo.add(makeHistory({ trackId: 't3', bvid: 'BV3', cid: 3, playedAt: 200 }))
  assert.deepEqual(repo.list().map((e) => e.trackId), ['t2', 't3', 't1'])
  assert.deepEqual(repo.list(2).map((e) => e.trackId), ['t2', 't3'])
  assert.deepEqual(repo.list(1).map((e) => e.trackId), ['t2'])
})

// —— ProgressRepository ——
test('ProgressRepository: save/get 往返 & ON CONFLICT 更新', () => {
  const repo = new ProgressRepository(createDb())
  assert.equal(repo.save(makeProgress({ trackId: 't1', position: 12.5, duration: 200, updatedAt: 1 })), true)
  const got = repo.get('t1')
  assert.ok(got)
  assert.equal(got.position, 12.5)
  assert.equal(got.duration, 200)
  assert.equal(got.updatedAt, 1)
  // 同 track_id 更新
  assert.equal(repo.save(makeProgress({ trackId: 't1', position: 30, duration: 200, updatedAt: 2 })), true)
  assert.equal(repo.get('t1')!.position, 30)
  assert.equal(repo.get('t1')!.updatedAt, 2)
  assert.equal(repo.get('不存在的id'), null)
})

// —— Repositories 聚合门面 ——
test('Repositories: 三个仓储共享同一 db 且互不串扰', () => {
  const repos = new Repositories(createDb())
  const p = repos.playlists.create('a', 'local')
  repos.playlists.addTracks(p.id, [makeTrack({ id: 't1', bvid: 'BV1', cid: 1 })])
  repos.history.add(makeHistory({ trackId: 't1', bvid: 'BV1', cid: 1 }))
  repos.progress.save(makeProgress({ trackId: 't1', position: 5 }))
  assert.equal(repos.playlists.listTracks(p.id).length, 1)
  assert.equal(repos.history.list().length, 1)
  assert.equal(repos.progress.get('t1')!.position, 5)
})
