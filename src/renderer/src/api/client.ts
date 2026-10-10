// react-query 实例 + window.api 薄封装 + 查询 hooks
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
  return useQuery({
    queryKey: ['history', limit],
    queryFn: () => unwrap(window.api.history.list(limit)),
  })
}

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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['playlists'] })
    },
  })
}

export function useRemoveTrack() {
  return useMutation({
    mutationFn: (args: { playlistId: string; trackId: string }) =>
      unwrap(window.api.library.removeTrack(args.playlistId, args.trackId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['playlists'] })
    },
  })
}
