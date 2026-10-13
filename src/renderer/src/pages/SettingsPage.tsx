// 设置页：主题 / 强调色 / 自动播放 / 歌词悬浮窗 / 语言 / 隐私 / 关于
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@renderer/store/settings-store'
import { BUILTIN_THEMES } from '@renderer/theme/themes'
import { toast } from '@renderer/components/ui'
import i18n, { SUPPORTED_LANGUAGES } from '@renderer/i18n'

export function SettingsPage() {
  const { t } = useTranslation()
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)

  const setOverlay = (patch: Partial<typeof settings.lyricOverlay>): void => {
    void update({ lyricOverlay: { ...settings.lyricOverlay, ...patch } })
  }

  const setLanguage = (language: string): void => {
    void i18n.changeLanguage(language)
    void update({ language })
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-6 text-xl font-bold">设置</h1>

      <Section title="主题">
        <div className="flex flex-wrap gap-3">
          {BUILTIN_THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => void update({ themeId: t.id, accentColor: t.accent })}
              className={`flex w-28 flex-col items-center gap-2 rounded-xl border p-3 transition ${
                settings.themeId === t.id
                  ? 'border-[var(--color-accent)]'
                  : 'border-black/10 dark:border-white/15'
              }`}
            >
              <span
                className="h-10 w-full rounded-lg"
                style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.background})` }}
              />
              <span className="text-xs">{t.name}</span>
            </button>
          ))}
        </div>

        <label className="mt-4 flex items-center gap-3 text-sm">
          <span className="w-24 text-[var(--color-text-secondary)]">强调色</span>
          <input
            type="color"
            value={settings.accentColor}
            onChange={(e) => void update({ accentColor: e.target.value })}
            className="h-8 w-12 cursor-pointer rounded border border-black/10 bg-transparent"
          />
          <span className="text-xs text-[var(--color-text-secondary)]">{settings.accentColor}</span>
        </label>
      </Section>

      <Section title="播放">
        <ToggleRow
          label="启动时自动续播上次内容"
          checked={settings.autoPlayOnLaunch}
          onChange={(v) => void update({ autoPlayOnLaunch: v })}
        />
      </Section>

      <Section title="桌面歌词">
        <div className="flex items-center justify-between py-1.5 text-sm">
          <span>显示位置</span>
          <div className="flex gap-1.5">
            <button
              onClick={() => setOverlay({ mode: 'taskbar' })}
              className={`rounded-full px-3 py-1 text-xs transition ${
                settings.lyricOverlay.mode === 'taskbar'
                  ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                  : 'bg-black/5 text-[var(--color-text-secondary)] dark:bg-white/10'
              }`}
            >
              任务栏
            </button>
            <button
              onClick={() => setOverlay({ mode: 'float' })}
              className={`rounded-full px-3 py-1 text-xs transition ${
                settings.lyricOverlay.mode === 'float'
                  ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                  : 'bg-black/5 text-[var(--color-text-secondary)] dark:bg-white/10'
              }`}
            >
              悬浮窗
            </button>
          </div>
        </div>

        {settings.lyricOverlay.mode === 'taskbar' && (
          <div className="flex items-center justify-between py-1.5 text-sm">
            <span>显示行数</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setOverlay({ lines: 1 })}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  settings.lyricOverlay.lines === 1
                    ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                    : 'bg-black/5 text-[var(--color-text-secondary)] dark:bg-white/10'
                }`}
              >
                单行
              </button>
              <button
                onClick={() => setOverlay({ lines: 2 })}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  settings.lyricOverlay.lines === 2
                    ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                    : 'bg-black/5 text-[var(--color-text-secondary)] dark:bg-white/10'
                }`}
              >
                双行
              </button>
            </div>
          </div>
        )}

        <ToggleRow
          label="窗口置顶"
          checked={settings.lyricOverlay.alwaysOnTop}
          onChange={(v) => setOverlay({ alwaysOnTop: v })}
        />
        <RangeRow
          label="不透明度"
          min={0.1}
          max={1}
          step={0.05}
          value={settings.lyricOverlay.opacity}
          display={`${Math.round(settings.lyricOverlay.opacity * 100)}%`}
          onChange={(v) => setOverlay({ opacity: v })}
        />
        <RangeRow
          label="字体大小"
          min={12}
          max={40}
          step={1}
          value={settings.lyricOverlay.fontSize}
          display={`${settings.lyricOverlay.fontSize}px`}
          onChange={(v) => setOverlay({ fontSize: v })}
        />
        <ToggleRow
          label="显示罗马音"
          checked={settings.lyricOverlay.showRoman}
          onChange={(v) => setOverlay({ showRoman: v })}
        />
        <ToggleRow
          label="显示翻译"
          checked={settings.lyricOverlay.showTranslation}
          onChange={(v) => setOverlay({ showTranslation: v })}
        />
      </Section>

      <Section title={t('settings.language')}>
        <div className="flex items-center gap-3 text-sm">
          <span className="w-24 text-[var(--color-text-secondary)]">{t('settings.language')}</span>
          <select
            value={settings.language}
            onChange={(e) => setLanguage(e.target.value)}
            className="rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)] dark:border-white/15"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value} className="text-black">
                {lang.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-[var(--color-text-secondary)]">{t('settings.languageHint')}</span>
        </div>
      </Section>

      <Section title={t('settings.privacy')}>
        <Link to="/privacy" className="text-sm text-[var(--color-accent)] hover:underline">
          {t('settings.privacyLink')}
        </Link>
      </Section>

      <Section title="关于">
        <p className="text-sm text-[var(--color-text-secondary)]">
          BBPlayer Desktop v0.1.0 · B 站音频播放器桌面端（开源 MIT）。
          快捷键自定义、开机自启等功能将在后续版本提供。
        </p>
        <button
          className="mt-2 text-sm text-[var(--color-accent)] hover:underline"
          onClick={() => toast('数据保存在用户目录：settings.json + bbplayer.db', 'info')}
        >
          查看数据存储说明
        </button>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      <div className="rounded-xl border border-black/5 bg-[var(--color-surface)] p-4 dark:border-white/10">{children}</div>
    </section>
  )
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-1.5 text-sm">
      <span>{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-[var(--color-accent)]' : 'bg-black/20 dark:bg-white/20'}`}
        aria-pressed={checked}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${checked ? 'left-4' : 'left-0.5'}`}
        />
      </button>
    </label>
  )
}

function RangeRow(props: {
  label: string
  min: number
  max: number
  step: number
  value: number
  display: string
  onChange: (v: number) => void
}) {
  const { label, min, max, step, value, display, onChange } = props
  return (
    <div className="flex items-center gap-3 py-1.5 text-sm">
      <span className="w-24 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 flex-1 cursor-pointer"
      />
      <span className="w-12 shrink-0 text-right text-xs text-[var(--color-text-secondary)]">{display}</span>
    </div>
  )
}
