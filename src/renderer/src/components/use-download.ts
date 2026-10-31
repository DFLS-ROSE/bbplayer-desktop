// 下载到本地：各页面共用的触发逻辑
import { useCallback, useMemo } from 'react'
import type { Track } from '@shared/types'
import { useDownloads } from '@renderer/api/client'
import { toast } from './ui'

/**
 * 触发下载。
 *
 * 曲目要能下载必须先有 cid（否则不知道取哪一路流），搜索结果的 cid 是 0，
 * 这时先补齐视频信息再下载。
 */
export function useDownload(): (track: Track) => Promise<void> {
  return useCallback(async (track: Track) => {
    let cid = track.cid
    if (!cid) {
      const r = await window.api.bili.getVideo(track.bvid)
      if (!r.ok) {
        toast(r.error.message, 'error')
        return
      }
      cid = r.data.cid
    }
    // 同一个视频的同一个分 P 只留一份文件：已下载过就不重复下（文件名是按标题拼的，
    // 重复下会静默覆盖，用户还以为在下第二份）
    const existing = await window.api.download.list()
    if (existing.ok && existing.data.some((d) => d.bvid === track.bvid && d.cid === cid)) {
      toast('这首歌已经下载过了')
      return
    }
    const res = await window.api.download.start({
      ...track,
      cid,
      id: track.id || `${track.bvid}_${cid}`,
    })
    if (res.ok) toast('已加入下载队列', 'success')
    else toast(res.error.message, 'error')
  }, [])
}

/**
 * 已下载到本地的曲目 id 集合。
 *
 * 列表里据此把下载按钮换成「已下载」标记，避免用户反复点同一个按钮。
 * 匹配用 trackId，但历史/搜索里的 id 可能只有 BV 号，所以另外提供
 * matchesDownloaded 做 bvid+cid 兜底。
 */
export function useDownloadedIds(): {
  ids: Set<string>
  matches: (track: Track) => boolean
} {
  // 已完成的下载有两个来源：
  // 1) 数据库记录（跨会话持久）
  // 2) 本次运行中收到「完成」事件的任务（比列表重取早一步，避免状态空窗）
  // 删除下载时会同时清掉这两者（remove 里 prune 掉任务），所以不会残留「已下载」标记
  const { records, tasks } = useDownloads()
  return useMemo(() => {
    const done = tasks.filter((t) => t.status === 'done')
    const ids = new Set([...records.map((r) => r.trackId), ...done.map((t) => t.trackId)])
    const keys = new Set([
      ...records.map((r) => `${r.bvid}_${r.cid}`),
      ...done.map((t) => `${t.bvid}_${t.cid}`),
    ])
    return {
      ids,
      matches: (track: Track) =>
        ids.has(track.id) || (!!track.cid && keys.has(`${track.bvid}_${track.cid}`)),
    }
  }, [records, tasks])
}
