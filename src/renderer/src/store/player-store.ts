// 播放器唯一真相源（Zustand）：audio-engine 只读写它，组件不直接操作 audio 元素
import { create } from 'zustand'
import type { PlayMode, Track } from '@shared/types'

interface PlayerStore {
  currentTrack: Track | null
  queue: Track[]
  queueIndex: number
  mode: PlayMode
  isPlaying: boolean
  position: number
  duration: number
  volume: number
  loudness: boolean
  /** 当前实际拿到的音质档位展示名（如 192K），空串表示未知 */
  audioLabel: string

  setCurrentTrack: (t: Track | null) => void
  setQueue: (queue: Track[], queueIndex: number) => void
  setMode: (mode: PlayMode) => void
  setPlaying: (isPlaying: boolean) => void
  setPosition: (position: number) => void
  setDuration: (duration: number) => void
  setVolume: (volume: number) => void
  setLoudness: (loudness: boolean) => void
  setAudioLabel: (audioLabel: string) => void
  removeFromQueue: (index: number) => void
  moveInQueue: (index: number, dir: 1 | -1) => void
  clearQueue: () => void
  reset: () => void
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  mode: 'sequence',
  isPlaying: false,
  position: 0,
  duration: 0,
  volume: 0.8,
  loudness: false,
  audioLabel: '',

  setCurrentTrack: (currentTrack) => set({ currentTrack }),
  setQueue: (queue, queueIndex) => set({ queue, queueIndex }),
  setMode: (mode) => set({ mode }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setPosition: (position) => set({ position }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume }),
  setLoudness: (loudness) => set({ loudness }),
  setAudioLabel: (audioLabel) => set({ audioLabel }),

  removeFromQueue: (index) =>
    set((s) => {
      const queue = s.queue.filter((_, i) => i !== index)
      let queueIndex = s.queueIndex
      if (index === s.queueIndex) queueIndex = -1
      else if (index < s.queueIndex) queueIndex = s.queueIndex - 1
      return { queue, queueIndex }
    }),

  moveInQueue: (index, dir) =>
    set((s) => {
      const target = index + dir
      if (target < 0 || target >= s.queue.length) return {}
      const queue = [...s.queue]
      const [item] = queue.splice(index, 1)
      queue.splice(target, 0, item)
      let queueIndex = s.queueIndex
      if (index === s.queueIndex) queueIndex = target
      else if (dir > 0 && index < s.queueIndex && target >= s.queueIndex) queueIndex--
      else if (dir < 0 && index > s.queueIndex && target <= s.queueIndex) queueIndex++
      return { queue, queueIndex }
    }),

  clearQueue: () => set({ queue: [], queueIndex: -1 }),

  reset: () =>
    set({
      currentTrack: null,
      queue: [],
      queueIndex: -1,
      isPlaying: false,
      position: 0,
      duration: 0,
      audioLabel: '',
    }),
}))
