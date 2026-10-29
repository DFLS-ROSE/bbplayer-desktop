// ============================================================================
// B 站分 P 视频：把一个视频的各分 P 变成可播放条目
// ============================================================================
import type { Track, VideoInfo, VideoPage } from './types'

/**
 * 单个分 P → 可播放条目。
 *
 * 多 P 视频里每个分 P 往往就是一首不同的歌（合集、连播、教程分节），
 * 所以分 P 标题会作为条目主标题 —— 这样歌词匹配用的是这一 P 真正的歌名，
 * 而不是整个合集的标题（用合集标题去搜歌词必然对不上）。
 */
export function buildPartTrack(info: VideoInfo, index: number): Track {
  const pages = info.pages ?? []
  const page = pages[index]
  const cid = page?.cid ?? info.cid
  const isMulti = pages.length > 1
  return {
    id: `${info.bvid}_${cid}`,
    bvid: info.bvid,
    cid,
    aid: info.aid,
    title: isMulti && page?.part ? page.part : info.title,
    artist: info.artist,
    coverUrl: info.coverUrl,
    duration: page?.duration || info.duration,
    source: 'search',
    videoTitle: isMulti ? info.title : undefined,
    partIndex: isMulti ? index : undefined,
    partTitle: isMulti ? page?.part : undefined,
  }
}

/** 视频的全部分 P → 条目列表；接口没给分 P 信息时就是主条目一条 */
export function buildPartTracks(info: VideoInfo): Track[] {
  const pages = info.pages ?? []
  if (pages.length === 0) {
    return [
      {
        id: `${info.bvid}_${info.cid}`,
        bvid: info.bvid,
        cid: info.cid,
        aid: info.aid,
        title: info.title,
        artist: info.artist,
        coverUrl: info.coverUrl,
        duration: info.duration,
        source: 'search',
      },
    ]
  }
  return pages.map((_, i) => buildPartTrack(info, i))
}

/**
 * 基于当前条目切换到另一个分 P：保留 bvid / UP 主 / 封面等，只换 cid 与标题。
 * 换了 cid 旧的播放地址就失效，必须清掉 audioUrl。
 */
export function buildPartTrackFrom(
  base: Track,
  page: VideoPage,
  index: number,
  total: number,
): Track {
  const isMulti = total > 1
  return {
    ...base,
    id: `${base.bvid}_${page.cid}`,
    cid: page.cid,
    duration: page.duration || base.duration,
    title: isMulti && page.part ? page.part : base.title,
    videoTitle: isMulti ? (base.videoTitle ?? base.title) : undefined,
    partIndex: isMulti ? index : undefined,
    partTitle: isMulti ? page.part : undefined,
    audioUrl: undefined,
  }
}
