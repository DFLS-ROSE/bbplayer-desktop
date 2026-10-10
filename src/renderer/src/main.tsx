import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initI18n } from './i18n'
import './styles/globals.css'

initI18n()

const container = document.getElementById('root')
if (!container) throw new Error('未找到 #root 挂载点')

createRoot(container).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
