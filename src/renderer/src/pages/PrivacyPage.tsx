// 隐私政策 + 免责声明页（P1，文案为技术初稿，需法务终稿）
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function PrivacyPage() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-6 text-xl font-bold">{t('privacy.title')}</h1>

      <section className="mb-6 rounded-xl border border-black/5 bg-[var(--color-surface)] p-5 dark:border-white/10">
        <h2 className="mb-3 text-base font-semibold">{t('privacy.privacyTitle')}</h2>
        <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
          {t('privacy.privacyContent')}
        </p>
      </section>

      <section className="mb-6 rounded-xl border border-black/5 bg-[var(--color-surface)] p-5 dark:border-white/10">
        <h2 className="mb-3 text-base font-semibold">{t('privacy.disclaimerTitle')}</h2>
        <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
          {t('privacy.disclaimerContent')}
        </p>
      </section>

      <p className="mb-4 text-xs text-[var(--color-text-secondary)]">{t('privacy.legalNote')}</p>

      <Link to="/settings" className="text-sm text-[var(--color-accent)] hover:underline">
        ← {t('privacy.back')}
      </Link>
    </div>
  )
}
