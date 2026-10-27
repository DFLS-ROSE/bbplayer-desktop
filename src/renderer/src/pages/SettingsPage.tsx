// 设置页：主题 / 强调色 / 自动播放 / 歌词悬浮窗 / 语言 / 隐私 / 更新 / 关于
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@renderer/store/settings-store'
import { usePlayerStore } from '@renderer/store/player-store'
import { engine } from '@renderer/audio/audio-engine'
import { BUILTIN_THEMES } from '@renderer/theme/themes'
import { toast } from '@renderer/components/ui'
import { AUDIO_QUALITY_OPTIONS, type AudioQualityPref } from '@shared/audio-quality'
import { formatOffset } from '@shared/lyrics-offset'
import i18n, { SUPPORTED_LANGUAGES } from '@renderer/i18n'
import type { LyricOffsetEntry, ReleaseInfo, StableUpdateResult, UpdateStatus } from '@shared/types'

export function SettingsPage() {
  const { t } = useTranslation()
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)

  // 版本号从主进程读，避免像以前那样在文案里写死导致版本对不上
  const [version, setVersion] = useState('')
  useEffect(() => {
    void (async () => {
      const r = await window.api.getVersion()
      if (r.ok) setVersion(r.data)
    })()
  }, [])

  const setOverlay = (patch: Partial<typeof settings.lyricOverlay>): void => {
    void update({ lyricOverlay: { ...settings.lyricOverlay, ...patch } })
  }

  const setLanguage = (language: string): void => {
    void i18n.changeLanguage(language)
    void update({ language })
  }

  const audioLabel = usePlayerStore((s) => s.audioLabel)

  /** 切换音质：保存偏好 → 重新取流并就地换源 → 用实际拿到的档位反馈 */
  const changeQuality = (value: AudioQualityPref): void => {
    void (async () => {
      await update({ audioQuality: value })
      await engine.reloadSource()
      const label = usePlayerStore.getState().audioLabel
      const name = AUDIO_QUALITY_OPTIONS.find((o) => o.value === value)?.label ?? value
      toast(label ? `音质已切换：${label}` : `音质偏好已保存：${name}（下一首生效）`, 'success')
    })()
  }

  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto overflow-x-hidden px-6 py-8">
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

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
          <span>音质</span>
          <div className="flex gap-1.5">
            {AUDIO_QUALITY_OPTIONS.map((o) => (
              <button
                key={o.value}
                title={o.hint}
                onClick={() => changeQuality(o.value)}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  settings.audioQuality === o.value
                    ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                    : 'bg-black/5 text-[var(--color-text-secondary)] dark:bg-white/10'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-[var(--color-text-secondary)]">
          {AUDIO_QUALITY_OPTIONS.find((o) => o.value === settings.audioQuality)?.hint ?? ''}
          {audioLabel && `　当前播放：${audioLabel}`}
        </p>
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

      <Section title="歌词偏移记录">
        <LyricOffsetList />
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
          BBPlayer Desktop v{version || '…'} · B 站音频播放器桌面端（开源 MIT）。
          快捷键自定义、开机自启等功能将在后续版本提供。
        </p>
        <button
          className="mt-2 text-sm text-[var(--color-accent)] hover:underline"
          onClick={() => toast('数据保存在用户目录：settings.json + bbplayer.db', 'info')}
        >
          查看数据存储说明
        </button>
      </Section>

      <CheckUpdateSection />
      <VersionListSection />
    </div>
  )
}

/** 歌词偏移记录：按 BV 号列出调过的曲目，可单条清除或全部清空 */
function LyricOffsetList() {
  const [rows, setRows] = useState<LyricOffsetEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = async (): Promise<void> => {
    const r = await window.api.lyrics.listOffsets(50)
    setRows(r.ok ? r.data : [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const resetOne = async (bvid: string): Promise<void> => {
    const r = await window.api.lyrics.resetOffset(bvid)
    if (!r.ok) {
      toast(r.error.message, 'error')
      return
    }
    void load()
  }

  const clearAll = async (): Promise<void> => {
    const r = await window.api.lyrics.clearOffsets()
    if (!r.ok) {
      toast(r.error.message, 'error')
      return
    }
    toast(`已清除 ${r.data} 条偏移记录`, 'success')
    void load()
  }

  return (
    <div className="text-sm">
      <p className="mb-3 text-xs text-[var(--color-text-secondary)]">
        调节过的歌曲会按 BV 号记住，同一视频（含其它分P）下次播放自动套用，无需反复调整。
      </p>
      {loading ? (
        <p className="py-3 text-xs text-[var(--color-text-secondary)]">加载中…</p>
      ) : rows.length === 0 ? (
        <p className="py-3 text-xs text-[var(--color-text-secondary)]">还没有调整过任何歌词偏移。</p>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-black/5 dark:divide-white/10">
            {rows.map((r) => (
              <div key={r.bvid} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-1">{r.title || r.bvid}</div>
                  <div className="text-xs text-[var(--color-text-secondary)]">
                    {r.bvid} · 调整 {r.changeCount} 次 · {new Date(r.updatedAt).toLocaleString()}
                  </div>
                </div>
                <span className="shrink-0 tabular-nums text-[var(--color-accent)]">
                  {formatOffset(r.offsetMs / 1000)}
                </span>
                <button
                  className="shrink-0 rounded px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-black/5 dark:hover:bg-white/10"
                  onClick={() => void resetOne(r.bvid)}
                >
                  清除
                </button>
              </div>
            ))}
          </div>
          <button
            className="mt-3 text-xs text-[var(--color-accent)] hover:underline"
            onClick={() => void clearAll()}
          >
            全部清除（{rows.length} 条）
          </button>
        </>
      )}
    </div>
  )
}

function CheckUpdateSection() {
  const [result, setResult] = useState<StableUpdateResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [downloading, setDownloading] = useState(false)

  const check = async (): Promise<void> => {
    setBusy(true)
    const r = await window.api.checkStableUpdate()
    if (r.ok) setResult(r.data)
    else setResult({ hasUpdate: false, currentVersion: '—', latest: null, error: r.error.message })
    setBusy(false)
  }

  useEffect(() => {
    const off = window.api.onUpdateStatus(setStatus)
    void check()
    return off
  }, [])

  const downloadLatest = async (): Promise<void> => {
    if (!result?.latest) return
    setDownloading(true)
    const r = await window.api.downloadVersion(result.latest.tag)
    if (!r.ok) toast(`下载失败：${r.error.message}`, 'error')
    setDownloading(false)
  }

  return (
    <Section title="检查更新">
      <div className="flex items-center justify-between text-sm">
        <span>
          当前版本 <span className="font-semibold">v{result?.currentVersion ?? '…'}</span>
          {result && !result.error && result.hasUpdate && (
            <span className="ml-2 text-[var(--color-accent)]">发现新版本 {result.latest?.tag}</span>
          )}
          {result && !result.error && !result.hasUpdate && (
            <span className="ml-2 text-[var(--color-text-secondary)]">已是最新稳定版</span>
          )}
        </span>
        <button
          onClick={() => void check()}
          disabled={busy}
          className="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-xs text-[var(--color-on-accent)] disabled:opacity-50"
        >
          {busy ? '检查中…' : '检查更新'}
        </button>
      </div>

      {result?.error && (
        <div className="mt-3 text-xs text-amber-600 dark:text-amber-400">检查失败：{result.error}</div>
      )}

      {status?.state === 'downloading' && (
        <div className="mt-3 text-xs text-[var(--color-text-secondary)]">
          正在下载更新… {status.percent ?? 0}%
        </div>
      )}
      {status?.state === 'downloaded' && (
        <div className="mt-3 text-xs text-[var(--color-accent)]">
          更新已下载，安装程序即将启动（覆盖安装后需手动重启）
        </div>
      )}

      {result?.hasUpdate && result.latest?.body && (
        <div className="mt-3 rounded-lg bg-black/5 p-3 dark:bg-white/5">
          <div className="mb-1.5 text-xs font-semibold text-[var(--color-text-primary)]">
            最新稳定版更新日志
          </div>
          <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-[var(--color-text-secondary)]">
            {result.latest.body}
          </pre>
        </div>
      )}

      {result?.hasUpdate && result.latest && (
        <button
          onClick={() => void downloadLatest()}
          disabled={downloading}
          className="mt-3 rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-xs text-[var(--color-on-accent)] disabled:opacity-50"
        >
          {downloading ? '下载中…' : '下载并安装最新稳定版'}
        </button>
      )}
    </Section>
  )
}

function VersionListSection() {
  const [versions, setVersions] = useState<ReleaseInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadingTag, setDownloadingTag] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    setBusy(true)
    const r = await window.api.listVersions()
    if (r.ok) {
      setVersions(r.data)
      setError(null)
    } else {
      setError(r.error.message)
    }
    setBusy(false)
  }

  useEffect(() => {
    void refresh()
  }, [])

  const download = async (tag: string): Promise<void> => {
    setDownloadingTag(tag)
    const r = await window.api.downloadVersion(tag)
    if (!r.ok) toast(`下载失败：${r.error.message}`, 'error')
    setDownloadingTag(null)
  }

  const fmtSize = (n?: number): string => (n ? `${(n / 1024 / 1024).toFixed(1)} MB` : '')

  return (
    <Section title="选择版本">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="text-xs text-[var(--color-text-secondary)]">
          列出所有已发布版本（含测试版），可选择性下载安装
        </span>
        <button
          onClick={() => void refresh()}
          disabled={busy}
          className="rounded-full bg-black/10 px-3 py-1 text-xs hover:bg-black/15 disabled:opacity-50 dark:bg-white/10 dark:hover:bg-white/15"
        >
          {busy ? '加载中…' : '刷新'}
        </button>
      </div>

      {error && <div className="mb-3 text-xs text-amber-600 dark:text-amber-400">加载失败：{error}</div>}

      {versions.length === 0 && !error && !busy && (
        <div className="text-xs text-[var(--color-text-secondary)]">暂无可用版本</div>
      )}

      <div className="flex flex-col gap-2">
        {versions.map((v) => (
          <div
            key={v.tag}
            className="flex items-center justify-between rounded-lg bg-black/5 px-3 py-2 text-sm dark:bg-white/5"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{v.name || v.tag}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  v.prerelease
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {v.prerelease ? '测试版' : '稳定版'}
              </span>
              {v.size != null && (
                <span className="text-xs text-[var(--color-text-secondary)]">{fmtSize(v.size)}</span>
              )}
            </div>
            <button
              onClick={() => void download(v.tag)}
              disabled={downloadingTag === v.tag}
              className="rounded-full bg-black/10 px-3 py-1 text-xs hover:bg-black/15 disabled:opacity-50 dark:bg-white/10 dark:hover:bg-white/15"
            >
              {downloadingTag === v.tag ? '下载中…' : '下载安装'}
            </button>
          </div>
        ))}
      </div>
    </Section>
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
