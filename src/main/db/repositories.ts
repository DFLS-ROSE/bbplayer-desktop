// 歌单 / 历史 / 进度 的仓储 CRUD（node:sqlite 同步 API）
import type {
  PlayHistoryEntry,
  PlaybackProgress,
  Playlist,
  PlaylistType,
  Track,
  TrackSource,
} from '../../shared/types'
import { getDb } from './database'

type Db = ReturnType<typeof getDb>

interface PlaylistRow {
  id: string
  name: string
  type: string
  source_id: string | null
  track_count: number
  created_at: number
  updated_at: number
}

interface TrackRow {
  playlist_id: string
  track_id: string
  bvid: string
  cid: number
  aid: number | null
  title: string
  artist: string
  cover_url: string
  duration: number
  source: string
  position: number
}

interface HistoryRow {
  track_id: string
  bvid: string
  cid: number
  title: string
  artist: string
  cover_url: string
  played_at: number
}

interface ProgressRow {
  track_id: string
  position: number
  duration: number
  updated_at: number
}

function now(): number {
  return Date.now()
}

function rowToPlaylist(r: PlaylistRow): Playlist {
  return {
    id: r.id,
    name: r.name,
    type: r.type as PlaylistType,
    sourceId: r.source_id ?? undefined,
    trackCount: r.track_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function rowToTrack(r: TrackRow): Track {
  return {
    id: r.track_id,
    bvid: r.bvid,
    cid: r.cid,
    aid: r.aid ?? undefined,
    title: r.title,
    artist: r.artist,
    coverUrl: r.cover_url,
    duration: r.duration,
    source: r.source as TrackSource,
    playlistId: r.playlist_id,
  }
}

function rowToHistory(r: HistoryRow): PlayHistoryEntry {
  return {
    trackId: r.track_id,
    bvid: r.bvid,
    cid: r.cid,
    title: r.title,
    artist: r.artist,
    coverUrl: r.cover_url,
    playedAt: r.played_at,
  }
}

function rowToProgress(r: ProgressRow): PlaybackProgress {
  return {
    trackId: r.track_id,
    position: r.position,
    duration: r.duration,
    updatedAt: r.updated_at,
  }
}

export class PlaylistRepository {
  constructor(private db: Db) {}

  list(type?: PlaylistType): Playlist[] {
    const rows = type
      ? (this.db.prepare('SELECT * FROM playlists WHERE type = ? ORDER BY updated_at DESC').all(type) as unknown as PlaylistRow[])
      : (this.db.prepare('SELECT * FROM playlists ORDER BY updated_at DESC').all() as unknown as PlaylistRow[])
    return rows.map(rowToPlaylist)
  }

  get(id: string): Playlist | null {
    const row = this.db.prepare('SELECT * FROM playlists WHERE id = ?').get(id) as PlaylistRow | undefined
    return row ? rowToPlaylist(row) : null
  }

  create(name: string, type: PlaylistType, sourceId?: string): Playlist {
    const id = `${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    const ts = now()
    this.db
      .prepare(
        'INSERT INTO playlists (id, name, type, source_id, track_count, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
      )
      .run(id, name, type, sourceId ?? null, ts, ts)
    return this.get(id)!
  }

  update(id: string, patch: { name?: string }): Playlist | null {
    const current = this.get(id)
    if (!current) return null
    const name = patch.name ?? current.name
    this.db.prepare('UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?').run(name, now(), id)
    return this.get(id)
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM playlists WHERE id = ?').run(id)
    this.db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(id)
    return Number(result.changes) > 0
  }

  addTracks(playlistId: string, tracks: Track[]): number {
    const playlist = this.get(playlistId)
    if (!playlist) return 0
    const stmt = this.db.prepare(
      `INSERT INTO playlist_tracks
        (playlist_id, track_id, bvid, cid, aid, title, artist, cover_url, duration, source, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(playlist_id, track_id) DO UPDATE SET
         title = excluded.title,
         artist = excluded.artist,
         cover_url = excluded.cover_url,
         duration = excluded.duration,
         source = excluded.source`,
    )
    this.db.exec('BEGIN')
    let count = 0
    try {
      for (const t of tracks) {
        const position = playlist.trackCount + count
        const info = stmt.run(
          playlistId,
          t.id,
          t.bvid,
          t.cid,
          t.aid ?? null,
          t.title,
          t.artist,
          t.coverUrl,
          t.duration,
          t.source,
          position,
        )
        count += Number(info.changes)
      }
      this.db.exec('COMMIT')
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
    this.refreshTrackCount(playlistId)
    return count
  }

  removeTrack(playlistId: string, trackId: string): boolean {
    const result = this.db
      .prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?')
      .run(playlistId, trackId)
    this.refreshTrackCount(playlistId)
    return Number(result.changes) > 0
  }

  listTracks(playlistId: string): Track[] {
    const rows = this.db
      .prepare('SELECT * FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC')
      .all(playlistId) as unknown as TrackRow[]
    return rows.map(rowToTrack)
  }

  searchTracks(query: string): Track[] {
    const like = `%${query}%`
    const rows = this.db
      .prepare(
        'SELECT * FROM playlist_tracks WHERE title LIKE ? OR artist LIKE ? OR bvid LIKE ? ORDER BY position ASC LIMIT 100',
      )
      .all(like, like, like) as unknown as TrackRow[]
    return rows.map(rowToTrack)
  }

  private refreshTrackCount(playlistId: string): void {
    const row = this.db
      .prepare('SELECT COUNT(*) AS c FROM playlist_tracks WHERE playlist_id = ?')
      .get(playlistId) as { c: number }
    this.db
      .prepare('UPDATE playlists SET track_count = ?, updated_at = ? WHERE id = ?')
      .run(row.c, now(), playlistId)
  }
}

export class HistoryRepository {
  constructor(private db: Db) {}

  add(entry: PlayHistoryEntry): boolean {
    const info = this.db
      .prepare(
        `INSERT INTO play_history (track_id, bvid, cid, title, artist, cover_url, played_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(track_id) DO UPDATE SET
           bvid = excluded.bvid,
           cid = excluded.cid,
           title = excluded.title,
           artist = excluded.artist,
           cover_url = excluded.cover_url,
           played_at = excluded.played_at`,
      )
      .run(
        entry.trackId,
        entry.bvid,
        entry.cid,
        entry.title,
        entry.artist,
        entry.coverUrl,
        entry.playedAt,
      )
    return Number(info.changes) > 0
  }

  list(limit = 100): PlayHistoryEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM play_history ORDER BY played_at DESC LIMIT ?')
      .all(limit) as unknown as HistoryRow[]
    return rows.map(rowToHistory)
  }
}

export class ProgressRepository {
  constructor(private db: Db) {}

  save(p: PlaybackProgress): boolean {
    const info = this.db
      .prepare(
        `INSERT INTO playback_progress (track_id, position, duration, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(track_id) DO UPDATE SET
           position = excluded.position,
           duration = excluded.duration,
           updated_at = excluded.updated_at`,
      )
      .run(p.trackId, p.position, p.duration, p.updatedAt)
    return Number(info.changes) > 0
  }

  get(trackId: string): PlaybackProgress | null {
    const row = this.db
      .prepare('SELECT * FROM playback_progress WHERE track_id = ?')
      .get(trackId) as ProgressRow | undefined
    return row ? rowToProgress(row) : null
  }
}

export class Repositories {
  readonly playlists: PlaylistRepository
  readonly history: HistoryRepository
  readonly progress: ProgressRepository

  constructor(db: Db = getDb()) {
    this.playlists = new PlaylistRepository(db)
    this.history = new HistoryRepository(db)
    this.progress = new ProgressRepository(db)
  }
}
