// 左侧导航栏（含登录入口 / 用户信息），MD3 药丸 active 态
import { NavLink } from 'react-router-dom'
import type { ComponentType } from 'react'
import { queryClient, useAuthState } from '@renderer/api/client'
import { useLoginModal } from './LoginModal'
import { toast } from './ui'
import {
  IconDownload,
  IconHistory,
  IconHome,
  IconLibrary,
  IconLogo,
  IconSearch,
  IconSettings,
} from './icons'

const NAV_ITEMS: { to: string; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { to: '/', label: '首页', icon: IconHome },
  { to: '/search', label: '搜索', icon: IconSearch },
  { to: '/playlists', label: '播放列表', icon: IconLibrary },
  { to: '/downloads', label: '下载', icon: IconDownload },
  { to: '/history', label: '播放历史', icon: IconHistory },
  { to: '/settings', label: '设置', icon: IconSettings },
]

export function Sidebar() {
  const { data: auth } = useAuthState()
  const openLogin = useLoginModal((s) => s.open)

  const handleLogout = async (): Promise<void> => {
    const r = await window.api.bili.logout()
    if (r.ok) {
      await queryClient.invalidateQueries({ queryKey: ['auth'] })
      toast('已退出登录', 'success')
    } else {
      toast(r.error.message, 'error')
    }
  }

  return (
    <aside className="flex h-full w-52 shrink-0 flex-col border-r border-black/5 bg-[var(--color-sidebar)] dark:border-white/10">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="text-[var(--color-accent)]">
          <IconLogo size={26} />
        </span>
        <span className="text-xl font-bold">BBPlayer</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map((it) => {
          const Icon = it.icon
          return (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-full px-3 py-2 text-sm transition ${
                  isActive
                    ? 'bg-[var(--color-accent-container)] font-medium text-[var(--color-on-accent-container)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-black/5 dark:hover:bg-white/5'
                }`
              }
            >
              <Icon size={20} />
              <span>{it.label}</span>
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t border-black/5 p-3 dark:border-white/10">
        {auth?.isLoggedIn ? (
          <div className="flex items-center gap-2">
            {auth.user?.face ? (
              <img src={auth.user.face} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-accent-container)] text-sm text-[var(--color-on-accent-container)]">
                {(auth.user?.name ?? 'U').slice(0, 1)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{auth.user?.name}</div>
              <button
                onClick={() => void handleLogout()}
                className="text-xs text-[var(--color-accent)] hover:underline"
              >
                退出登录
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={openLogin}
            className="w-full rounded-full bg-[var(--color-accent)] py-2 text-sm font-medium text-[var(--color-on-accent)] transition hover:opacity-90"
          >
            登录 B 站
          </button>
        )}
      </div>
    </aside>
  )
}
