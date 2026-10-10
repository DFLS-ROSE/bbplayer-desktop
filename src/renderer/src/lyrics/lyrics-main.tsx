// 歌词悬浮窗 React 入口
import { createRoot } from 'react-dom/client'
import { LyricsOverlay } from './LyricsOverlay'
import { ErrorBoundary } from '../components/ErrorBoundary'
import '../styles/globals.css'

const container = document.getElementById('root')
if (!container) throw new Error('未找到 #root 挂载点')

createRoot(container).render(
  <ErrorBoundary>
    <LyricsOverlay />
  </ErrorBoundary>,
)
