// 设置镜像（与主进程 app-store 同步）：改动即 settings:set 回写
import { create } from 'zustand'
import { DEFAULT_SETTINGS } from '@shared/constants'
import type { Settings } from '@shared/types'

interface SettingsStore {
  settings: Settings
  loaded: boolean
  load: () => Promise<void>
  update: (patch: Partial<Settings>) => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    const r = await window.api.settings.get()
    if (r.ok) set({ settings: r.data, loaded: true })
  },

  update: async (patch) => {
    const prev = get().settings
    const merged: Settings = {
      ...prev,
      ...patch,
      lyricOverlay: { ...prev.lyricOverlay, ...(patch.lyricOverlay ?? {}) },
    }
    set({ settings: merged })
    const r = await window.api.settings.set(patch)
    if (r.ok) set({ settings: r.data })
  },
}))
