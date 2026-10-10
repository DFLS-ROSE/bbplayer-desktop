// SQLite 连接与建表迁移（node:sqlite DatabaseSync，仅主进程访问）
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'

let db: DatabaseSync | null = null

/** 初始化数据库（幂等）。仅在 app ready 后调用一次。 */
export function initDatabase(userDataPath: string): DatabaseSync {
  if (db) return db
  db = new DatabaseSync(join(userDataPath, 'bbplayer.db'))
  db.exec('PRAGMA journal_mode = WAL')
  migrate(db)
  return db
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('数据库尚未初始化')
  return db
}

function migrate(d: DatabaseSync): void {
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
  `)
}
