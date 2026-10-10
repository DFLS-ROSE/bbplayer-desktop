// 搜索框（关键词 / BV / AV / b23.tv）
import { useState } from 'react'

export function SearchBar(props: {
  onSearch: (keyword: string) => void
  placeholder?: string
  initial?: string
}) {
  const { onSearch, placeholder = '搜索关键词 / BV号 / AV号 / b23.tv 链接', initial = '' } = props
  const [value, setValue] = useState(initial)

  const submit = (): void => {
    const v = value.trim()
    if (!v) return
    onSearch(v)
  }

  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-xl border border-black/10 bg-[var(--color-surface)] px-4 py-2.5 text-sm outline-none focus:border-[var(--color-accent)] dark:border-white/15"
      />
      <button
        onClick={submit}
        className="rounded-xl bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
      >
        搜索
      </button>
    </div>
  )
}
