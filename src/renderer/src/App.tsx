// 根组件：react-query + HashRouter + 主题 + 媒体键 + 会话恢复 + i18n
import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider, useTranslation } from 'react-i18next'
import i18n from './i18n'
import { queryClient } from './api/client'
import { initMediaSession } from './audio/media-session'
import { engine } from './audio/audio-engine'
import { usePlayerStore } from './store/player-store'
import { useSettingsStore } from './store/settings-store'
import { applyDynamicColor, applyTheme, getTheme } from './theme/themes'
import { buildM3Palette, extractDominantColor } from './theme/dynamic-color'
import { Sidebar } from './components/Sidebar'
import { PlayerBar } from './components/PlayerBar'
import { LoginModal, useLoginModal } from './components/LoginModal'
import { ToastHost, toast } from './components/ui'
import { HomePage } from './pages/HomePage'

// 非首屏页面懒加载：减小首屏 bundle，加快启动
const SearchPage = lazy(() => import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })))
const PlaylistPage = lazy(() => import('./pages/PlaylistPage').then((m) => ({ default: m.PlaylistPage })))
const HistoryPage = lazy(() => import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const NowPlayingPage = lazy(() => import('./pages/NowPlayingPage').then((m) => ({ default: m.NowPlayingPage })))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })))

export default function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <Root />
      </QueryClientProvider>
    </I18nextProvider>
  )
}

function Root() {
  const { t } = useTranslation()
  const openLogin = useLoginModal((s) => s.open)
  const settings = useSettingsStore((s) => s.settings)
  const settingsLoaded = useSettingsStore((s) => s.loaded)
  const loadSettings = useSettingsStore((s) => s.load)
  const currentTrack = usePlayerStore((s) => s.currentTrack)

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    applyTheme(getTheme(settings.themeId), settings.accentColor)
  }, [settings.themeId, settings.accentColor])

  // 动态取色：当前曲目封面变化时提取主色并应用（Material You）
  useEffect(() => {
    const cover = currentTrack?.coverUrl
    if (!cover) {
      applyTheme(getTheme(settings.themeId), settings.accentColor)
      return
    }
    let cancelled = false
    void (async () => {
      const color = await extractDominantColor(cover)
      if (cancelled || !color) return
      const isDark = document.documentElement.getAttribute('data-dark') === 'true'
      applyDynamicColor(buildM3Palette(color, isDark))
    })()
    return () => {
      cancelled = true
    }
  }, [currentTrack?.coverUrl, settings.themeId, settings.accentColor])

  useEffect(() => {
    if (settingsLoaded) void i18n.changeLanguage(settings.language)
  }, [settingsLoaded, settings.language])

  useEffect(() => {
    initMediaSession()
    const offCommand = window.api.onPlayerCommand((cmd) => {
      switch (cmd.type) {
        case 'toggle':
          engine.toggle()
          break
        case 'play':
          engine.play()
          break
        case 'pause':
          engine.pause()
          break
        case 'next':
          engine.next()
          break
        case 'prev':
          engine.prev()
          break
        case 'seek':
          engine.seek(cmd.position)
          break
        case 'setMode':
          usePlayerStore.getState().setMode(cmd.mode)
          break
        case 'toggleLoudness':
          engine.setLoudness(!usePlayerStore.getState().loudness)
          break
      }
    })
    return () => {
      offCommand()
    }
  }, [])

  // 登录态失效推送（语言变化时重新注册以使用最新文案）
  useEffect(() => {
    const offAuth = window.api.onAuthChanged(() => {
      void queryClient.invalidateQueries({ queryKey: ['auth'] })
      toast(t('auth.expired'), 'error')
      openLogin()
    })
    return offAuth
  }, [t, openLogin])

  // 启动会话恢复
  useEffect(() => {
    if (!settingsLoaded) return
    void (async () => {
      const r = await window.api.session.get()
      if (!r.ok || r.data.lastQueue.length === 0) return
      const { lastQueue, lastQueueIndex } = r.data
      const track = lastQueue[lastQueueIndex]
      if (!track) return
      usePlayerStore.getState().setQueue(lastQueue, lastQueueIndex)
      usePlayerStore.getState().setCurrentTrack(track)
      if (settings.autoPlayOnLaunch) {
        await engine.playTrack(track, lastQueue, lastQueueIndex)
      }
    })()
  }, [settingsLoaded, settings.autoPlayOnLaunch])

  return (
    <HashRouter>
      <div className="flex h-screen flex-col overflow-hidden bg-[var(--color-bg)] text-[var(--color-text-primary)]">
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
            <Suspense
              fallback={
                <div className="p-8 text-sm text-[var(--color-text-secondary)]">加载中…</div>
              }
            >
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/playlists" element={<PlaylistPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/now-playing" element={<NowPlayingPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
              </Routes>
            </Suspense>
          </main>
        </div>
        <PlayerBar />
      </div>
      <LoginModal />
      <ToastHost />
    </HashRouter>
  )
}
