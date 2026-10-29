// react-query 实例 + window.api 薄封装 + 查询 hooks
import { useEffect, useMemo, useState } from 'react'
import { QueryClient, useMutation, useQuery } from '@tanstack/react-query'
import type {
  AuthState,
  PlayHistoryEntry,
  Playlist,
  PlaylistType,
  Result,
  SearchResult,
  Track,
} from '@shared/types'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})

/** 解包 Result：失败抛错（供 react-query onError 统一处理） */
export async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
  const r = await promise
  if (!r.ok) throw new Error(r.error.message)
  return r.data
}

export function useAuthState(): { data?: AuthState; isLoading: boolean; refetch: () => void } {
  return useQuery({ queryKey: ['auth'], queryFn: () => unwrap(window.api.bili.authState()) })
}

export function usePlaylists(type?: PlaylistType): {
  data?: Playlist[]
  isLoading: boolean
  refetch: () => void
} {
  return useQuery({
    queryKey: ['playlists', type ?? 'all'],
    queryFn: () => unwrap(window.api.library.list(type)),
  })
}

export function usePlaylistTracks(id?: string): { data?: Track[]; isLoading: boolean } {
  return useQuery({
    queryKey: ['playlist-tracks', id],
    queryFn: () => unwrap(window.api.library.listTracks(id!)),
    enabled: !!id,
  })
}

export function useHistory(limit = 100): { data?: PlayHistoryEntry[]; isLoading: boolean } {
  const query = useQuery({
    queryKey: ['history', limit],
    queryFn: () => unwrap(window.api.history.list(limit)),
  })
  const data = useFillHistoryDurations(query.data)
  return { data, isLoading: query.isLoading }
}

/** 已经尝试过补全的曲目（同一进程内不重复请求） */
const durationFilled = new Set<string>()

/**
 * 老版本写进播放历史的数据没有时长字段，列表里全是 00:00。
 * 这里按 bvid 拉一次视频信息补上时长并回写（回写时保留原 played_at，避免打乱历史排序）。
 * 多 P 视频优先取对应分 P 的时长。
 */
function useFillHistoryDurations(entries?: PlayHistoryEntry[]): PlayHistoryEntry[] {
  const [filled, setFilled] = useState<Record<string, number>>({})
  const list = entries ?? EMPTY_HISTORY

  useEffect(() => {
    const missing = list.filter((e) => !e.duration && e.bvid && !durationFilled.has(e.trackId))
    if (missing.length === 0) return
    let cancelled = false
    void (async () => {
      // 并发补全：串行的话十几条历史要等好几秒
      const queue = [...missing]
      const CONCURRENCY = 4
      const worker = async (): Promise<void> => {
        for (;;) {
          if (cancelled) return
          const e = queue.shift()
          if (!e) return
          durationFilled.add(e.trackId)
          const r = await window.api.bili.getVideo(e.bvid)
          if (cancelled) return
          if (!r.ok) continue
          const page = r.data.pages?.find((p) => p.cid === e.cid)
          const duration = page?.duration || r.data.duration || 0
          if (duration <= 0) continue
          await window.api.history.add({ ...e, duration })
          setFilled((prev) => (prev[e.trackId] === duration ? prev : { ...prev, [e.trackId]: duration }))
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()),
      )
      // 首页与历史页用的是不同的查询 key（['history',20] / ['history',200]），
      // 补完必须让所有历史查询失效重取，否则另一页仍显示旧数据
      if (!cancelled) void queryClient.invalidateQueries({ queryKey: ['history'] })
    })()
    return () => {
      cancelled = true
    }
  }, [list])

  return useMemo(
    () => list.map((e) => (e.duration ? e : { ...e, duration: filled[e.trackId] ?? 0 })),
    [list, filled],
  )
}

const EMPTY_HISTORY: PlayHistoryEntry[] = []

export function useSearch(keyword: string, page = 1): { data?: SearchResult; isLoading: boolean } {
  return useQuery({
    queryKey: ['search', keyword, page],
    queryFn: () => unwrap(window.api.bili.search(keyword, page)),
    enabled: keyword.trim().length > 0,
  })
}

// —— 写操作统一走 mutation + invalidate（收口「写后失效」）——
export function useCreatePlaylist() {
  return useMutation({
    mutationFn: (args: { name: string; type: PlaylistType; sourceId?: string }) =>
      unwrap(window.api.library.create(args.name, args.type, args.sourceId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['playlists'] })
    },
  })
}

export function useDeletePlaylist() {
  return useMutation({
    mutationFn: (id: string) => unwrap(window.api.library.delete(id)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['playlists'] })
    },
  })
}

export function useAddTracks() {
  return useMutation({
    mutationFn: (args: { playlistId: string; tracks: Track[] }) =>
      unwrap(window.api.library.addTracks(args.playlistId, args.tracks)),
    onSuccess: (_data, args) => {
      void queryClient.invalidateQueries({ queryKey: ['playlists'] })
      // 页面栈常驻（切标签不卸载），歌单详情必须手动失效才会刷新
      void queryClient.invalidateQueries({ queryKey: ['playlist-tracks', args.playlistId] })
    },
  })
}

export function useRemoveTrack() {
  return useMutation({
    mutationFn: (args: { playlistId: string; trackId: string }) =>
      unwrap(window.api.library.removeTrack(args.playlistId, args.trackId)),
    onSuccess: (_data, args) => {
      void queryClient.invalidateQueries({ queryKey: ['playlists'] })
      void queryClient.invalidateQueries({ queryKey: ['playlist-tracks', args.playlistId] })
    },
  })
}
