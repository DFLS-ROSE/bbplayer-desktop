// SQLite 连接与建表迁移（node:sqlite DatabaseSync，仅主进程访问）
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'

let db: DatabaseSync | null = null

/** 初始化数据库（幂等）。仅在 app ready 后调用一次。 */
export function initDatabase(userDataPath: string): DatabaseSync {
  if (db) return db
  db = new DatabaseSync(join(userDataPath, 'bbplayer.db'))
  db.exec('PRAGMA journal_mode = WAL')
  applySchema(db)
  return db
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('数据库尚未初始化')
  return db
}

/** 建表 + 补列（幂等，可重复执行） */
export function applySchema(d: DatabaseSync): void {
  d.exec(`
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
      part_index  INTEGER,
      part_title  TEXT NOT NULL DEFAULT '',
      video_title TEXT NOT NULL DEFAULT '',
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
      duration  INTEGER NOT NULL DEFAULT 0,
      part_index  INTEGER,
      part_title  TEXT NOT NULL DEFAULT '',
      video_title TEXT NOT NULL DEFAULT '',
      played_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playback_progress (
      track_id   TEXT PRIMARY KEY,
      position   REAL NOT NULL DEFAULT 0,
      duration   REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lyric_cache (
      track_id    TEXT PRIMARY KEY,
      bvid        TEXT NOT NULL DEFAULT '',
      title       TEXT NOT NULL DEFAULT '',
      artist      TEXT NOT NULL DEFAULT '',
      source      TEXT NOT NULL,
      lrc         TEXT NOT NULL,
      translation TEXT,
      roman       TEXT,
      updated_at  INTEGER NOT NULL
    );

    -- 歌词偏移：按 BV 号记忆（同一视频的不同分P共用一份偏移，不用反复调）
    CREATE TABLE IF NOT EXISTS lyric_offset (
      bvid       TEXT PRIMARY KEY,
      title      TEXT NOT NULL DEFAULT '',
      offset_ms  INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    -- 偏移调整记录：每次改动留痕，用于展示调整次数与追溯
    CREATE TABLE IF NOT EXISTS lyric_offset_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      bvid       TEXT NOT NULL,
      title      TEXT NOT NULL DEFAULT '',
      from_ms    INTEGER NOT NULL,
      to_ms      INTEGER NOT NULL,
      changed_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lyric_offset_log_bvid
      ON lyric_offset_log(bvid);
  `)

  // 老库的表已建好，CREATE TABLE IF NOT EXISTS 不会补列，这里显式迁移
  ensureColumn(d, 'play_history', 'duration', 'INTEGER NOT NULL DEFAULT 0')
  // 分P 信息（多P 视频的序号与所属视频标题）
  ensureColumn(d, 'playlist_tracks', 'part_index', 'INTEGER')
  ensureColumn(d, 'playlist_tracks', 'part_title', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(d, 'playlist_tracks', 'video_title', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(d, 'play_history', 'part_index', 'INTEGER')
  ensureColumn(d, 'play_history', 'part_title', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(d, 'play_history', 'video_title', "TEXT NOT NULL DEFAULT ''")
}

/** 缺列就补一列（SQLite 不支持 ADD COLUMN IF NOT EXISTS，只能先查表结构） */
function ensureColumn(d: DatabaseSync, table: string, column: string, decl: string): void {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[]
  if (cols.some((c) => c.name === column)) return
  d.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`)
}
