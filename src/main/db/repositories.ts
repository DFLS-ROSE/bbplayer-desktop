// 歌单 / 历史 / 进度 / 歌词缓存 / 歌词偏移 的仓储 CRUD（node:sqlite 同步 API）
import type {
  DownloadRecord,
  LyricCacheEntry,
  LyricOffsetEntry,
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
  part_index: number | null
  part_title: string
  video_title: string
}

interface HistoryRow {
  track_id: string
  bvid: string
  cid: number
  title: string
  artist: string
  cover_url: string
  duration: number
  part_index: number | null
  part_title: string
  video_title: string
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
    partIndex: r.part_index ?? undefined,
    partTitle: r.part_title || undefined,
    videoTitle: r.video_title || undefined,
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
    duration: r.duration ?? 0,
    partIndex: r.part_index ?? undefined,
    partTitle: r.part_title || undefined,
    videoTitle: r.video_title || undefined,
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
        (playlist_id, track_id, bvid, cid, aid, title, artist, cover_url, duration, source, position,
         part_index, part_title, video_title)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(playlist_id, track_id) DO UPDATE SET
         title = excluded.title,
         artist = excluded.artist,
         cover_url = excluded.cover_url,
         duration = excluded.duration,
         source = excluded.source,
         part_index = excluded.part_index,
         part_title = excluded.part_title,
         video_title = excluded.video_title`,
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
          t.partIndex ?? null,
          t.partTitle ?? '',
          t.videoTitle ?? '',
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
        `INSERT INTO play_history (track_id, bvid, cid, title, artist, cover_url, duration, played_at, part_index, part_title, video_title)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(track_id) DO UPDATE SET
           bvid = excluded.bvid,
           cid = excluded.cid,
           title = excluded.title,
           artist = excluded.artist,
           cover_url = excluded.cover_url,
           duration = excluded.duration,
           played_at = excluded.played_at,
           part_index = excluded.part_index,
           part_title = excluded.part_title,
           video_title = excluded.video_title`,
      )
      .run(
        entry.trackId,
        entry.bvid,
        entry.cid,
        entry.title,
        entry.artist,
        entry.coverUrl,
        Math.round(entry.duration || 0),
        entry.playedAt,
        entry.partIndex ?? null,
        entry.partTitle ?? '',
        entry.videoTitle ?? '',
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

interface LyricCacheRow {
  track_id: string
  bvid: string
  title: string
  artist: string
  source: string
  lrc: string
  translation: string | null
  roman: string | null
  updated_at: number
}

function rowToLyricCache(r: LyricCacheRow): LyricCacheEntry {
  return {
    trackId: r.track_id,
    bvid: r.bvid,
    title: r.title,
    artist: r.artist,
    source: r.source,
    lrc: r.lrc,
    translation: r.translation ?? undefined,
    roman: r.roman ?? undefined,
    updatedAt: r.updated_at,
  }
}

export class LyricCacheRepository {
  constructor(private db: Db) {}

  save(entry: LyricCacheEntry): boolean {
    const info = this.db
      .prepare(
        `INSERT INTO lyric_cache (track_id, bvid, title, artist, source, lrc, translation, roman, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(track_id) DO UPDATE SET
           bvid = excluded.bvid,
           title = excluded.title,
           artist = excluded.artist,
           source = excluded.source,
           lrc = excluded.lrc,
           translation = excluded.translation,
           roman = excluded.roman,
           updated_at = excluded.updated_at`,
      )
      .run(
        entry.trackId,
        entry.bvid,
        entry.title,
        entry.artist,
        entry.source,
        entry.lrc,
        entry.translation ?? null,
        entry.roman ?? null,
        entry.updatedAt,
      )
    return Number(info.changes) > 0
  }

  get(trackId: string): LyricCacheEntry | null {
    const row = this.db
      .prepare('SELECT * FROM lyric_cache WHERE track_id = ?')
      .get(trackId) as LyricCacheRow | undefined
    return row ? rowToLyricCache(row) : null
  }
}

interface LyricOffsetRow {
  bvid: string
  title: string
  offset_ms: number
  updated_at: number
}

/**
 * 歌词偏移：按 BV 号记忆。
 * 同一 BV 的不同分P（cid 不同）共用一份偏移，避免同一视频反复调整。
 */
export class LyricOffsetRepository {
  constructor(private db: Db) {}

  /** 读取偏移（毫秒）；从未调整过返回 null（调用方据此决定是否沿用旧 LRC 里的 [offset:]） */
  get(bvid: string): number | null {
    if (!bvid) return null
    const row = this.db
      .prepare('SELECT offset_ms FROM lyric_offset WHERE bvid = ?')
      .get(bvid) as { offset_ms: number } | undefined
    return row ? row.offset_ms : null
  }

  /** 写入偏移；值没变化时不产生调整记录。返回是否发生实际变化。 */
  set(bvid: string, title: string, offsetMs: number): boolean {
    if (!bvid) return false
    const next = Math.round(offsetMs)
    const prev = this.get(bvid)
    if (prev === next) return false

    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO lyric_offset (bvid, title, offset_ms, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(bvid) DO UPDATE SET
           title = excluded.title,
           offset_ms = excluded.offset_ms,
           updated_at = excluded.updated_at`,
      )
      .run(bvid, title, next, now)
    this.db
      .prepare(
        `INSERT INTO lyric_offset_log (bvid, title, from_ms, to_ms, changed_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(bvid, title, prev ?? 0, next, now)
    return true
  }

  /** 偏移列表（最近调整在前），带累计调整次数 */
  list(limit = 100): LyricOffsetEntry[] {
    const rows = this.db
      .prepare(
        `SELECT o.bvid, o.title, o.offset_ms, o.updated_at,
                (SELECT COUNT(*) FROM lyric_offset_log l WHERE l.bvid = o.bvid) AS change_count
         FROM lyric_offset o
         ORDER BY o.updated_at DESC, o.rowid DESC
         LIMIT ?`,
      )
      .all(limit) as unknown as (LyricOffsetRow & { change_count: number })[]
    return rows.map((r) => ({
      bvid: r.bvid,
      title: r.title,
      offsetMs: r.offset_ms,
      updatedAt: r.updated_at,
      changeCount: r.change_count,
    }))
  }

  /** 清除某 BV 的偏移（调整日志保留，便于统计） */
  reset(bvid: string): boolean {
    if (!bvid) return false
    const info = this.db.prepare('DELETE FROM lyric_offset WHERE bvid = ?').run(bvid)
    return Number(info.changes) > 0
  }

  /** 清空全部偏移与调整记录 */
  clearAll(): number {
    const info = this.db.prepare('DELETE FROM lyric_offset').run()
    this.db.prepare('DELETE FROM lyric_offset_log').run()
    return Number(info.changes)
  }
}

// —— DownloadRepository：已下载音频的记录 ——
export class DownloadRepository {
  constructor(private db: Db) {}

  /** 写入/更新下载记录（同一 trackId 覆盖） */
  upsert(rec: DownloadRecord): boolean {
    const info = this.db
      .prepare(
        `INSERT INTO downloads
          (track_id, bvid, cid, title, artist, cover_url, duration, file_path, file_size, quality, downloaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(track_id) DO UPDATE SET
           bvid = excluded.bvid,
           cid = excluded.cid,
           title = excluded.title,
           artist = excluded.artist,
           cover_url = excluded.cover_url,
           duration = excluded.duration,
           file_path = excluded.file_path,
           file_size = excluded.file_size,
           quality = excluded.quality,
           downloaded_at = excluded.downloaded_at`,
      )
      .run(
        rec.trackId,
        rec.bvid,
        rec.cid,
        rec.title,
        rec.artist,
        rec.coverUrl,
        Math.round(rec.duration || 0),
        rec.filePath,
        rec.fileSize,
        rec.quality,
        rec.downloadedAt,
      )
    return Number(info.changes) > 0
  }

  /** 按下载时间倒序列出全部记录 */
  list(): DownloadRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM downloads ORDER BY downloaded_at DESC')
      .all() as unknown as DownloadRow[]
    return rows.map(rowToDownload)
  }

  get(trackId: string): DownloadRecord | null {
    const row = this.db.prepare('SELECT * FROM downloads WHERE track_id = ?').get(trackId) as
      | DownloadRow
      | undefined
    return row ? rowToDownload(row) : null
  }

  /** 删除记录（文件由调用方负责删除） */
  remove(trackId: string): boolean {
    const info = this.db.prepare('DELETE FROM downloads WHERE track_id = ?').run(trackId)
    return Number(info.changes) > 0
  }
}

interface DownloadRow {
  track_id: string
  bvid: string
  cid: number
  title: string
  artist: string
  cover_url: string
  duration: number
  file_path: string
  file_size: number
  quality: string
  downloaded_at: number
}

function rowToDownload(r: DownloadRow): DownloadRecord {
  return {
    trackId: r.track_id,
    bvid: r.bvid,
    cid: r.cid,
    title: r.title,
    artist: r.artist,
    coverUrl: r.cover_url,
    duration: r.duration,
    filePath: r.file_path,
    fileSize: r.file_size,
    quality: r.quality,
    downloadedAt: r.downloaded_at,
  }
}

export class Repositories {  readonly playlists: PlaylistRepository
  readonly history: HistoryRepository
  readonly progress: ProgressRepository
  readonly lyricCache: LyricCacheRepository
  readonly lyricOffset: LyricOffsetRepository
  readonly downloads: DownloadRepository

  constructor(db: Db = getDb()) {
    this.playlists = new PlaylistRepository(db)
    this.history = new HistoryRepository(db)
    this.progress = new ProgressRepository(db)
    this.lyricCache = new LyricCacheRepository(db)
    this.lyricOffset = new LyricOffsetRepository(db)
    this.downloads = new DownloadRepository(db)
  }
}
