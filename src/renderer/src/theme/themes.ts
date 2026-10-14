// 内置 B 站主题集 + 自定义强调色（CSS 变量换肤）
import { buildM3Palette, type M3Palette } from './dynamic-color'

export interface Theme {
  id: string
  name: string
  isDark: boolean
  accent: string
  background: string
  surface: string
  sidebar: string
  textPrimary: string
  textSecondary: string
}

export const BUILTIN_THEMES: Theme[] = [
  {
    id: 'bili-pink',
    name: '哔哩粉',
    isDark: false,
    accent: '#fb7299',
    background: '#fdeef4',
    surface: '#ffffff',
    sidebar: '#ffffff',
    textPrimary: '#18191c',
    textSecondary: '#61666d',
  },
  {
    id: 'bili-blue',
    name: '哔哩蓝',
    isDark: false,
    accent: '#00aeec',
    background: '#f0f6fb',
    surface: '#ffffff',
    sidebar: '#ffffff',
    textPrimary: '#18191c',
    textSecondary: '#61666d',
  },
  {
    id: 'midnight',
    name: '深夜黑',
    isDark: true,
    accent: '#fb7299',
    background: '#0f0f13',
    surface: '#1a1a1f',
    sidebar: '#141417',
    textPrimary: '#f1f1f1',
    textSecondary: '#9a9aa2',
  },
  {
    id: 'sakura',
    name: '樱花白',
    isDark: false,
    accent: '#ff9ab5',
    background: '#fafafa',
    surface: '#ffffff',
    sidebar: '#faf7f8',
    textPrimary: '#3a2c30',
    textSecondary: '#8a7a7f',
  },
  {
    id: 'forest',
    name: '森林绿',
    isDark: false,
    accent: '#2fb27c',
    background: '#eef6f1',
    surface: '#ffffff',
    sidebar: '#ffffff',
    textPrimary: '#1a2e25',
    textSecondary: '#5f7269',
  },
]

export function getTheme(id: string): Theme {
  return BUILTIN_THEMES.find((t) => t.id === id) ?? BUILTIN_THEMES[0]
}

export function applyTheme(theme: Theme, accentOverride?: string): void {
  const root = document.documentElement
  const accent = accentOverride || theme.accent
  const p = buildM3Palette(accent, theme.isDark)
  root.style.setProperty('--color-accent', accent)
  root.style.setProperty('--color-on-accent', '#ffffff')
  root.style.setProperty('--color-accent-container', p.accentContainer)
  root.style.setProperty('--color-on-accent-container', p.onAccentContainer)
  root.style.setProperty('--color-bg', theme.background)
  root.style.setProperty('--color-surface', theme.surface)
  root.style.setProperty('--color-sidebar', theme.sidebar)
  root.style.setProperty('--color-text-primary', theme.textPrimary)
  root.style.setProperty('--color-text-secondary', theme.textSecondary)
  root.setAttribute('data-theme', theme.id)
  root.setAttribute('data-dark', theme.isDark ? 'true' : 'false')
}

/**
 * 应用动态取色结果（Material You）：仅覆盖 accent 语义色，
 * 其余背景/文字色保留当前固定主题。
 */
export function applyDynamicColor(palette: M3Palette): void {
  const root = document.documentElement
  root.style.setProperty('--color-accent', palette.accent)
  root.style.setProperty('--color-on-accent', palette.onAccent)
  root.style.setProperty('--color-accent-container', palette.accentContainer)
  root.style.setProperty('--color-on-accent-container', palette.onAccentContainer)
}
