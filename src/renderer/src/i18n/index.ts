// i18next 初始化：首发中英双语，fallback 中文
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'

export const SUPPORTED_LANGUAGES = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' },
] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['value']

export function initI18n(lng?: string): void {
  void i18n.use(initReactI18next).init({
    resources: {
      'zh-CN': { translation: zhCN },
      'en-US': { translation: enUS },
    },
    lng: lng ?? 'zh-CN',
    fallbackLng: 'zh-CN',
    interpolation: { escapeValue: false },
  })
}

export default i18n
