// HTML5 Audio 播放引擎 + Web Audio 响度均衡 + 断点续播 + 历史/会话持久化
import { queryClient } from '@renderer/api/client'
import { usePlayerStore } from '@renderer/store/player-store'
import { useSettingsStore } from '@renderer/store/settings-store'
import { toast } from '@renderer/components/ui'
import { buildSourceList, hostOf } from '@shared/media-sources'
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
  private volumeSaveTimer: number | null = null
  private lastProgressSaveAt = 0
  private lastSessionSaveAt = 0
  /** 当前曲目的候选播放地址（主地址 + 备用 CDN 节点），按顺序尝试 */
  private sources: string[] = []
  private sourceIndex = 0
  /** 切源时要恢复的播放位置 */
  private resumeAt = 0
  /** 候选地址全失败后是否已重新拉取过一次播放地址（防止无限重试） */
  private refetchedUrls = false
  /** 本轮播放是否已经判定彻底失败（play() 的 rejection 与 error 事件会各触发一次，避免重复提示） */
  private failedCompletely = false

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
    this.audio.addEventListener('error', () => void this.onMediaError())
  }

  /**
   * 播放源加载失败（mediaError 4 = SRC_NOT_SUPPORTED）。
   *
   * B 站 DASH 会同时下发主地址和若干备用 CDN 节点，其中 `*.mcdn.bilivideo.cn`
   * 是 P2P 边缘节点，经常直接返回 503/403（响应体为空），Chromium 统一归类为
   * 「格式不支持」，看起来像编码问题，其实是节点挂了。这里按顺序切到备用地址，
   * 全挂则重新拉一次播放地址（签名与节点是动态分配的，重取往往能换到好节点）。
   */
  private async onMediaError(): Promise<void> {
    const store = usePlayerStore.getState()
    const track = store.currentTrack
    const errCode = this.audio.error?.code
    if (!track || this.sources.length === 0 || this.failedCompletely) return

    const failedUrl = this.sources[this.sourceIndex] ?? ''
    // 切源前记住播放进度，避免换节点后从头开始
    if (Number.isFinite(this.audio.currentTime) && this.audio.currentTime > 1) {
      this.resumeAt = this.audio.currentTime
    }

    store.setPlaying(false)
    void window.api.log({
      level: 'warn',
      scope: 'audio',
      message: '播放源加载失败',
      extra: {
        mediaError: errCode,
        mediaErrorMsg: this.audio.error?.message,
        host: hostOf(failedUrl),
        tried: this.sourceIndex + 1,
        total: this.sources.length,
      },
    })

    // 1. 先切下一个备用地址
    if (this.sourceIndex + 1 < this.sources.length) {
      this.sourceIndex += 1
      this.applySource()
      try {
        await this.audio.play()
        store.setPlaying(true)
      } catch {
        /* 再失败会继续触发 error 事件，交由下一次处理 */
      }
      return
    }

    // 2. 备用地址也全挂：重新取一次播放地址（新的签名 / 新的节点）
    // 本地文件没有「换个地址」的概念，直接判失败
    if (!this.refetchedUrls && !track.localFileId) {
      this.refetchedUrls = true
      try {
        const r = await window.api.bili.playUrl(track.bvid, track.cid)
        if (r.ok) {
          const sources = buildSourceList(r.data.audioUrl, r.data.backupUrls)
          if (sources.length > 0) {
            this.sources = sources
            this.sourceIndex = 0
            store.setAudioLabel(r.data.audioLabel ?? '')
            void window.api.log({
              level: 'info',
              scope: 'audio',
              message: '重新获取播放地址',
              extra: { count: this.sources.length, host: hostOf(this.sources[0] ?? '') },
            })
            this.applySource()
            try {
              await this.audio.play()
              store.setPlaying(true)
            } catch {
              /* 新地址也失败时由 error 事件继续走这一轮的候选，不在这里判死 */
            }
            return
          }
        }
      } catch {
        /* 取地址本身失败，落到下面的统一失败处理 */
      }
    }

    // 3. 彻底失败：明确告知用户，不要在元素上留下半死状态
    this.failedCompletely = true
    void window.api.log({
      level: 'error',
      scope: 'audio',
      message: '所有播放源均不可用',
      extra: { mediaError: errCode, trackId: track.id },
    })
    toast('这首暂时播放不了（B 站 CDN 节点异常），稍后重试或换一首', 'error')
  }

  /** 把当前候选地址装载到 audio 元素上 */
  private applySource(): void {
    const url = this.sources[this.sourceIndex]
    if (!url) return
    this.audio.src = url
    if (this.resumeAt > 0) {
      try {
        this.audio.currentTime = this.resumeAt
      } catch {
        /* 元数据未就绪时赋值可能抛错，忽略即可，load 后 Chromium 会自行定位 */
      }
    }
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
          const pages = r.data.pages ?? []
          const first = pages[0]
          const isMulti = pages.length > 1
          resolved = {
            ...resolved,
            id: `${resolved.bvid}_${r.data.cid}`,
            cid: r.data.cid,
            aid: r.data.aid,
            // 多 P 视频的第一 P 标题往往才是这一 P 的歌名（合集 / 连播），
            // 用它去匹配歌词比用整个合集标题准得多
            title: (isMulti && first?.part) || r.data.title || resolved.title,
            artist: r.data.artist || resolved.artist,
            coverUrl: r.data.coverUrl || resolved.coverUrl,
            duration: first?.duration || r.data.duration || resolved.duration,
            videoTitle: isMulti ? r.data.title : undefined,
            partIndex: isMulti ? 0 : undefined,
            partTitle: isMulti ? first?.part : undefined,
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

    // 取播放地址：本地已下载的优先用本地文件，其次在线流（主地址 + 备用 CDN 节点）
    let sources: string[] = []
    if (resolved.localFileId) {
      // 本地文件走自定义协议，主进程按 trackId 提供文件流（支持 Range，拖进度条可用）
      sources = [`bbplayer-local://track/${encodeURIComponent(resolved.localFileId)}`]
    } else if (resolved.audioUrl) sources = buildSourceList(resolved.audioUrl, [])
    else {
      const r = await window.api.bili.playUrl(resolved.bvid, resolved.cid)
      if (!r.ok) throw new Error(r.error.message)
      sources = buildSourceList(r.data.audioUrl, r.data.backupUrls)
      resolved = { ...resolved, audioUrl: r.data.audioUrl }
      if (r.data.duration) store.setDuration(r.data.duration)
      store.setAudioLabel(r.data.audioLabel ?? '')
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

    this.sources = sources
    this.sourceIndex = 0
    this.resumeAt = startAt
    this.refetchedUrls = false
    this.failedCompletely = false
    this.applySource()
    store.setPosition(startAt)
    this.setVolume(store.volume)

    try {
      await this.ensureAudioGraph()
      await this.audio.play()
    } catch (e) {
      usePlayerStore.getState().setPlaying(false)
      // 源加载失败交给 onMediaError 做备用地址切换（它会记一条更完整的日志），这里不重复记
      const isSrcUnsupported =
        this.audio.error?.code === 4 || (e instanceof Error && e.name === 'NotSupportedError')
      if (!isSrcUnsupported) {
        void window.api.log({
          level: 'warn',
          scope: 'audio',
          message: '播放失败',
          extra: { error: e instanceof Error ? e.message : String(e), trackId: resolved.id },
        })
      }
    }
    void this.recordHistory(resolved)
    void this.saveSession()
  }

  /** 应用解析后的曲目：更新 currentTrack 并同步回队列，避免下次点击队列重复解析 */
  private applyResolved(resolved: Track): void {
    const s = usePlayerStore.getState()
    s.setCurrentTrack(resolved)
    // id 会在补齐 cid 后变化；优先精确匹配 id，兜底按 bvid 匹配尚未解析的旧条目
    const idx = s.queue.findIndex(
      (t) => t.id === resolved.id || (t.bvid === resolved.bvid && !t.cid),
    )
    if (idx >= 0) {
      const q = [...s.queue]
      q[idx] = resolved
      s.setQueue(q, s.queueIndex)
    }
  }

  /** 元素上是否还有一个「能重新播」的源：NETWORK_NO_SOURCE 表示元素已放弃加载，直接 play() 只会报 no supported sources */
  private hasPlayableSource(): boolean {
    return !!this.audio.src && this.audio.networkState !== HTMLMediaElement.NETWORK_NO_SOURCE
  }

  /** 切换播放/暂停：无源时若有当前曲目则直接加载播放；否则按底层真实状态切换并保持 store 同步 */
  toggle(): void {
    if (!this.hasPlayableSource()) {
      this.startCurrent()
      return
    }
    if (this.audio.paused) void this.resumeAndPlay()
    else this.pause()
  }

  play(): void {
    if (!this.hasPlayableSource()) {
      this.startCurrent()
      return
    }
    void this.resumeAndPlay()
  }

  pause(): void {
    this.audio.pause()
    usePlayerStore.getState().setPlaying(false)
  }

  /**
   * 无可用音频源但存在当前曲目时重新加载播放。
   * 强制丢弃曲目上缓存的 audioUrl（签名会过期、节点会换），重新向接口取地址。
   */
  private startCurrent(): void {
    const s = usePlayerStore.getState()
    if (!s.currentTrack) return
    void this.playTrack({ ...s.currentTrack, audioUrl: undefined }, s.queue, s.queueIndex)
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
      // 元素已彻底没有可用源（例如节点 503 后被判 NO_SOURCE）：重新取地址再播，别停在死状态
      if (!this.hasPlayableSource()) {
        this.startCurrent()
        return
      }
      void window.api.log({
        level: 'warn',
        scope: 'audio',
        message: '播放失败',
        extra: { error: e instanceof Error ? e.message : String(e) },
      })
    }
  }

  /**
   * 重新取一次当前曲目的播放地址并就地换源（切换音质后立即生效）。
   * 保留播放位置；播放中会继续播，失败则由备用地址切换与错误提示兜底。
   */
  async reloadSource(): Promise<void> {
    const store = usePlayerStore.getState()
    const track = store.currentTrack
    if (!track || !this.audio.src) return
    const wasPlaying = !this.audio.paused
    this.resumeAt = Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0

    const r = await window.api.bili.playUrl(track.bvid, track.cid)
    if (!r.ok) return
    const sources = buildSourceList(r.data.audioUrl, r.data.backupUrls)
    if (sources.length === 0) return

    this.sources = sources
    this.sourceIndex = 0
    this.refetchedUrls = false
    this.failedCompletely = false
    store.setAudioLabel(r.data.audioLabel ?? '')
    this.applySource()
    if (wasPlaying) {
      try {
        await this.audio.play()
      } catch {
        /* 失败会触发 error 事件，走备用地址切换 */
      }
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
    // 防抖持久化音量，避免拖动时频繁写盘
    if (this.volumeSaveTimer != null) window.clearTimeout(this.volumeSaveTimer)
    this.volumeSaveTimer = window.setTimeout(() => {
      void useSettingsStore.getState().update({ volume: clamped })
    }, 300)
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
      this.audio.play().catch(() => this.startCurrent())
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
    // 时长优先取曲目自身的，缺失时用播放器的（元素元数据加载后会更新）
    const duration = track.duration || usePlayerStore.getState().duration || 0
    await window.api.history.add({
      trackId: track.id,
      bvid: track.bvid,
      cid: track.cid,
      title: track.title,
      artist: track.artist,
      coverUrl: track.coverUrl,
      duration,
      partIndex: track.partIndex,
      partTitle: track.partTitle,
      videoTitle: track.videoTitle,
      playedAt: Date.now(),
    })
    // 页面常驻后不会再靠重新挂载刷新，「最近播放」/ 播放历史都只认缓存，必须显式失效
    void queryClient.invalidateQueries({ queryKey: ['history'] })
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
