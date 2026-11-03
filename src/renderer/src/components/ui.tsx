// 通用 UI：Modal / Toast / Button / Spinner / ProgressBar / 时间格式化
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useRef, useState } from 'react'
import { create } from 'zustand'
import { IconClose } from './icons'

// ============ Toast ============
interface ToastItem {
  id: number
  message: string
  type: 'info' | 'error' | 'success'
}
interface ToastState {
  toasts: ToastItem[]
  push: (message: string, type?: ToastItem['type']) => void
  remove: (id: number) => void
}

let toastSeq = 0

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (message, type = 'info') => {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 3200)
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export function toast(message: string, type: ToastItem['type'] = 'info'): void {
  useToastStore.getState().push(message, type)
}

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-[9999] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`max-w-[80vw] rounded-full px-4 py-2 text-sm text-white ${
            t.type === 'error'
              ? 'bg-red-500/90'
              : t.type === 'success'
                ? 'bg-green-600/90'
                : 'bg-black/70'
          }`}
          style={{ boxShadow: 'var(--elevation-2)' }}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}

// ============ Modal ============
export function Modal(props: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  width?: number
}) {
  const { open, onClose, title, children, width = 560 } = props
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] flex-col overflow-hidden rounded-2xl bg-[var(--color-surface)]"
        style={{ width: `min(${width}px, 94vw)`, boxShadow: 'var(--elevation-3)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-3 dark:border-white/10">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            className="rounded-full p-1.5 text-[var(--color-text-secondary)] hover:bg-black/5 dark:hover:bg-white/10"
            onClick={onClose}
            aria-label="关闭"
          >
            <IconClose size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

// ============ Button ============
export function Button(props: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit'
  title?: string
}) {
  const { children, onClick, variant = 'primary', disabled, className = '', type = 'button', title } = props
  const base =
    'inline-flex items-center justify-center gap-1 rounded-full px-4 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50'
  const variants: Record<string, string> = {
    primary: 'bg-[var(--color-accent)] text-white hover:opacity-90',
    secondary:
      'border border-black/10 bg-transparent text-[var(--color-text-primary)] hover:bg-black/5 dark:border-white/15',
    ghost: 'text-[var(--color-text-secondary)] hover:bg-black/5',
    danger: 'bg-red-500 text-white hover:bg-red-600',
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  )
}

// ============ Spinner ============
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent ${className}`}
    />
  )
}

// ============ ProgressBar（可点击拖拽跳转） ============
export function ProgressBar(props: {
  value: number
  max: number
  onSeek?: (v: number) => void
  className?: string
  /** 显示可拖动的圆点（底部播放栏 / 歌词页用） */
  thumb?: boolean
}) {
  const { value, max, onSeek, className = '', thumb = true } = props
  // 拖动期间只更新本地预览，松手才真正 seek —— 边拖边 seek 会把远端流反复打断
  const [dragValue, setDragValue] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const ratioAt = (clientX: number): number => {
    const el = rootRef.current
    if (!el || max <= 0) return 0
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return 0
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }

  const shown = dragValue ?? value
  const pct = max > 0 ? Math.min(100, Math.max(0, (shown / max) * 100)) : 0
  const dragging = dragValue != null

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!onSeek || max <= 0) return
    e.preventDefault()
    // 捕获指针：拖到条外面（甚至窗口边缘）也继续跟手（个别环境不支持，忽略即可）
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 没有活动指针时（如合成事件）会抛错，退化成普通拖动 */
    }
    setDragValue(ratioAt(e.clientX) * max)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragging) return
    setDragValue(ratioAt(e.clientX) * max)
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragging) return
    const target = ratioAt(e.clientX) * max
    setDragValue(null)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* 指针已释放时忽略 */
    }
    onSeek?.(target)
  }

  return (
    <div
      ref={rootRef}
      className={`group relative h-1.5 rounded-full bg-black/10 dark:bg-white/15 ${
        onSeek ? 'cursor-pointer' : ''
      } ${className}`}
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={() => setDragValue(null)}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-accent)]"
        style={{ width: `${pct}%` }}
      />
      {thumb && (
        <span
          className={`pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-accent)] transition-[width,height] ${
            dragging ? 'h-3 w-3' : 'h-2.5 w-2.5 group-hover:h-3 group-hover:w-3'
          }`}
          style={{ left: `${pct}%`, boxShadow: '0 0 0 2px var(--color-surface, #fff)' }}
          aria-hidden="true"
        />
      )}
      {/* 透明热区：条本身只有 6px 高，直接点很难命中；不占布局高度 */}
      {onSeek && <div className="absolute -inset-x-1 -inset-y-2" />}
    </div>
  )
}

// ============ 时间格式化 ============
export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
