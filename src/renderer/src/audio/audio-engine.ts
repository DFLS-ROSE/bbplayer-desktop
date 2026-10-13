// HTML5 Audio 播放引擎 + Web Audio 响度均衡 + 断点续播 + 历史/会话持久化
import { usePlayerStore } from '@renderer/store/player-store'
import type { SessionContext, Track } from '@shared/types'

type AudioCtor = typeof AudioContext

class AudioEngine {
  private audio: HTMLAudioElement
  private audioCtx: AudioContext | null = null
  private sourceNode: MediaElementAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private compressor: DynamicsCompressorNode | null = null
  private gainNode: GainNode | null = null
  private restoreToken = 0
  private lastProgressSaveAt = 0
  private lastSessionSaveAt = 0

  constructor() {
    this.audio = new Audio()
    this.audio.preload = 'auto'
    this.bindEvents()
  }

  private bindEvents(): void {
    this.audio.addEventListener('timeupdate', () => this.onTimeUpdate())
    this.audio.addEventListener('loadedmetadata', () => this.syncDuration())
    this.audio.addEventListener('durationchange', () => this.syncDuration())
    this.audio.addEventListener('play', () => usePlayerStore.getState().setPlaying(true))
    this.audio.addEventListener('pause', () => {
      usePlayerStore.getState().setPlaying(false)
      void this.saveProgress()
    })
    this.audio.addEventListener('ended', () => this.onEnded())
    this.audio.addEventListener('error', () => {
      usePlayerStore.getState().setPlaying(false)
      void window.api.log({
        level: 'error',
        scope: 'audio',
        message: '播放出错',
        extra: { mediaError: this.audio.error?.code, mediaErrorMsg: this.audio.error?.message },
      })
    })
  }

  private syncDuration(): void {
    const d = this.audio.duration
    if (Number.isFinite(d) && d > 0) usePlayerStore.getState().setDuration(d)
  }

  /** 播放指定曲目；可同时传入队列与下标 */
  async playTrack(track: Track, queue?: Track[], index?: number): Promise<void> {
    const store = usePlayerStore.getState()
    const token = ++this.restoreToken

    if (queue && index != null) {
      store.setQueue(queue, index)
    } else {
      // 未传入队列：若已在队列则跳到该位置，否则追加到队列末尾（不清空当前队列）
      const existing = store.queue.findIndex((t) => t.id === track.id)
      if (existing >= 0) store.setQueue(store.queue, existing)
      else store.setQueue([...store.queue, track], store.queue.length)
    }

    store.setCurrentTrack(track)
    store.setDuration(track.duration || 0)

    // 搜索结果的 cid 为 0，播放前补齐视频信息
    let resolved = track
    if (!resolved.cid) {
      try {
        const r = await window.api.bili.getVideo(resolved.bvid)
        if (r.ok) {
          resolved = {
            ...resolved,
            cid: r.data.cid,
            aid: r.data.aid,
            title: r.data.title || resolved.title,
            artist: r.data.artist || resolved.artist,
            coverUrl: r.data.coverUrl || resolved.coverUrl,
            duration: r.data.duration || resolved.duration,
          }
          this.applyResolved(resolved)
        }
      } catch (e) {
        void window.api.log({
          level: 'warn',
          scope: 'audio',
          message: '解析视频信息失败',
          extra: { error: e instanceof Error ? e.message : String(e) },
        })
      }
    }

    // 取播放地址
    let audioUrl = resolved.audioUrl
    if (!audioUrl) {
      const r = await window.api.bili.playUrl(resolved.bvid, resolved.cid)
      if (!r.ok) throw new Error(r.error.message)
      audioUrl = r.data.audioUrl
      resolved = { ...resolved, audioUrl }
      if (r.data.duration) store.setDuration(r.data.duration)
      this.applyResolved(resolved)
    }

    if (token !== this.restoreToken) return // 期间已被其它播放请求切换

    // 断点续播
    let startAt = 0
    const progress = await window.api.progress.get(resolved.id)
    if (progress.ok && progress.data) {
      const dur = progress.data.duration || resolved.duration
      if (progress.data.position > 3 && (dur === 0 || progress.data.position < dur - 5)) {
        startAt = progress.data.position
      }
    }

    this.audio.src = audioUrl
    this.audio.currentTime = startAt
    store.setPosition(startAt)
    this.setVolume(store.volume)

    try {
      await this.ensureAudioGraph()
      await this.audio.play()
    } catch (e) {
      usePlayerStore.getState().setPlaying(false)
      void window.api.log({
        level: 'warn',
        scope: 'audio',
        message: '播放失败',
        extra: { error: e instanceof Error ? e.message : String(e), trackId: resolved.id },
      })
    }
    void this.recordHistory(resolved)
    void this.saveSession()
  }

  /** 应用解析后的曲目：更新 currentTrack 并同步回队列，避免下次点击队列重复解析 */
  private applyResolved(resolved: Track): void {
    const s = usePlayerStore.getState()
    s.setCurrentTrack(resolved)
    const idx = s.queue.findIndex((t) => t.id === resolved.id)
    if (idx >= 0) {
      const q = [...s.queue]
      q[idx] = resolved
      s.setQueue(q, s.queueIndex)
    }
  }

  /** 切换播放/暂停：无源时若有当前曲目则直接加载播放；否则按底层真实状态切换并保持 store 同步 */
  toggle(): void {
    if (!this.audio.src) {
      this.startCurrent()
      return
    }
    if (this.audio.paused) void this.resumeAndPlay()
    else this.pause()
  }

  play(): void {
    if (!this.audio.src) {
      this.startCurrent()
      return
    }
    void this.resumeAndPlay()
  }

  pause(): void {
    this.audio.pause()
    usePlayerStore.getState().setPlaying(false)
  }

  /** 无音频源但存在当前曲目时，重新加载并播放（如启动续播未开启时点击播放） */
  private startCurrent(): void {
    const s = usePlayerStore.getState()
    if (s.currentTrack) void this.playTrack(s.currentTrack, s.queue, s.queueIndex)
  }

  /** 播放前恢复 Web Audio 图（响度均衡），播放后同步 store；失败时回滚为暂停态 */
  private async resumeAndPlay(): Promise<void> {
    const token = ++this.restoreToken

    try {
      await this.ensureAudioGraph()
    } catch (e) {
      usePlayerStore.getState().setPlaying(false)
      void window.api.log({
        level: 'warn',
        scope: 'audio',
        message: '恢复音频图失败',
        extra: { error: e instanceof Error ? e.message : String(e) },
      })
      return
    }

    try {
      await this.audio.play()
      if (token !== this.restoreToken) return // 期间已切换曲目，旧请求不再覆盖新状态
      usePlayerStore.getState().setPlaying(true)
    } catch (e) {
      usePlayerStore.getState().setPlaying(false)
      void window.api.log({
        level: 'warn',
        scope: 'audio',
        message: '播放失败',
        extra: { error: e instanceof Error ? e.message : String(e) },
      })
    }
  }

  seek(t: number): void {
    if (!Number.isFinite(t)) return
    this.audio.currentTime = Math.max(0, t)
    usePlayerStore.getState().setPosition(this.audio.currentTime)
  }

  setVolume(v: number): void {
    const clamped = Math.min(1, Math.max(0, v))
    if (this.audioCtx && this.gainNode) {
      this.audio.volume = 1
      this.gainNode.gain.value = clamped
    } else {
      this.audio.volume = clamped
    }
    usePlayerStore.getState().setVolume(clamped)
  }

  setLoudness(on: boolean): void {
    usePlayerStore.getState().setLoudness(on)
    if (this.compressor) this.compressor.threshold.value = on ? -24 : 0
    if (on) void this.ensureAudioGraph()
  }

  next(): void {
    this.advance(1)
  }

  prev(): void {
    this.advance(-1)
  }

  private advance(dir: 1 | -1): void {
    const s = usePlayerStore.getState()
    const q = s.queue
    if (q.length === 0) return
    let nextIndex: number
    if (s.mode === 'shuffle') {
      nextIndex = Math.floor(Math.random() * q.length)
      if (nextIndex === s.queueIndex && q.length > 1) nextIndex = (nextIndex + 1) % q.length
    } else {
      nextIndex = s.queueIndex + dir
      if (nextIndex < 0) nextIndex = q.length - 1
      if (nextIndex >= q.length) nextIndex = 0
    }
    const track = q[nextIndex]
    if (track) void this.playTrack(track, q, nextIndex)
  }

  private onEnded(): void {
    const s = usePlayerStore.getState()
    void this.saveProgress()
    if (s.mode === 'loop-one') {
      this.audio.currentTime = 0
      void this.audio.play()
      return
    }
    if (s.mode === 'sequence' && s.queueIndex >= s.queue.length - 1) {
      usePlayerStore.getState().setPlaying(false)
      return
    }
    this.next()
  }

  private onTimeUpdate(): void {
    const s = usePlayerStore.getState()
    s.setPosition(this.audio.currentTime)
    const nowMs = Date.now()
    if (nowMs - this.lastProgressSaveAt > 5000) {
      this.lastProgressSaveAt = nowMs
      void this.saveProgress()
    }
    if (nowMs - this.lastSessionSaveAt > 15000) {
      this.lastSessionSaveAt = nowMs
      void this.saveSession()
    }
  }

  private async ensureAudioGraph(): Promise<void> {
    if (!usePlayerStore.getState().loudness) return
    if (!this.audioCtx) {
      const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext)!
      this.audioCtx = new Ctor()
      this.sourceNode = this.audioCtx.createMediaElementSource(this.audio)
      this.analyser = this.audioCtx.createAnalyser()
      this.compressor = this.audioCtx.createDynamicsCompressor()
      this.gainNode = this.audioCtx.createGain()

      this.sourceNode.connect(this.analyser)
      this.analyser.connect(this.compressor)
      this.compressor.connect(this.gainNode)
      this.gainNode.connect(this.audioCtx.destination)

      this.compressor.threshold.value = -24
      this.compressor.knee.value = 30
      this.compressor.ratio.value = 12
      this.compressor.attack.value = 0.003
      this.compressor.release.value = 0.25
      this.audio.volume = 1
      this.gainNode.gain.value = usePlayerStore.getState().volume
    }
    await this.audioCtx.resume()
  }

  private async recordHistory(track: Track): Promise<void> {
    await window.api.history.add({
      trackId: track.id,
      bvid: track.bvid,
      cid: track.cid,
      title: track.title,
      artist: track.artist,
      coverUrl: track.coverUrl,
      playedAt: Date.now(),
    })
  }

  private async saveProgress(): Promise<void> {
    const s = usePlayerStore.getState()
    const t = s.currentTrack
    if (!t) return
    await window.api.progress.save({
      trackId: t.id,
      position: s.position,
      duration: s.duration || t.duration,
      updatedAt: Date.now(),
    })
  }

  private async saveSession(): Promise<void> {
    const s = usePlayerStore.getState()
    const ctx: SessionContext = {
      lastTrackId: s.currentTrack?.id,
      lastQueue: s.queue,
      lastQueueIndex: s.queueIndex,
      lastPosition: s.position,
      lastMode: s.mode,
      savedAt: Date.now(),
    }
    await window.api.session.set(ctx)
  }
}

export const engine = new AudioEngine()
