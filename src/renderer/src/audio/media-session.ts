// Media Session 集成（系统媒体键 / 锁屏 / 蓝牙线控）
import { usePlayerStore } from '@renderer/store/player-store'
import type { Track } from '@shared/types'
import { engine } from './audio-engine'

export function initMediaSession(): void {
  if (!('mediaSession' in navigator)) return
  const ms = navigator.mediaSession

  ms.setActionHandler('play', () => engine.play())
  ms.setActionHandler('pause', () => engine.pause())
  ms.setActionHandler('previoustrack', () => engine.prev())
  ms.setActionHandler('nexttrack', () => engine.next())
  ms.setActionHandler('stop', () => engine.pause())
  ms.setActionHandler('seekto', (details) => {
    if (details.seekTime != null) engine.seek(details.seekTime)
  })

  usePlayerStore.subscribe((state, prev) => {
    if (state.currentTrack?.id !== prev.currentTrack?.id || state.isPlaying !== prev.isPlaying) {
      updateMetadata(state.currentTrack, state.isPlaying)
    }
  })

  updateMetadata(usePlayerStore.getState().currentTrack, usePlayerStore.getState().isPlaying)
}

function updateMetadata(track: Track | null, playing: boolean): void {
  if (!('mediaSession' in navigator)) return
  const ms = navigator.mediaSession
  if (!track) {
    ms.metadata = null
    return
  }
  ms.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: 'BBPlayer',
    artwork: track.coverUrl ? [{ src: track.coverUrl, sizes: '512x512', type: 'image/jpeg' }] : [],
  })
  ms.playbackState = playing ? 'playing' : 'paused'
}
