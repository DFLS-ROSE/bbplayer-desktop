// B 站 / 歌词 / 导入 的 IPC 处理器
import { IPC, wrap } from '../../shared/ipc'
import { handleSafe } from './guard'
import type { ServiceDeps } from './index'

export function registerBilibiliHandlers({ api, auth, lyricsService, importers }: ServiceDeps): void {
  handleSafe(IPC.BiliGetVideo, (_e, payload: { bvid: string }) =>
    wrap(() => api.getVideoInfo(payload.bvid)),
  )
  handleSafe(IPC.BiliSearch, (_e, payload: { keyword: string; page?: number }) =>
    wrap(() => api.search(payload.keyword, payload.page ?? 1)),
  )
  handleSafe(IPC.BiliPlayUrl, (_e, payload: { bvid: string; cid: number }) =>
    wrap(() => api.getPlayUrl(payload.bvid, payload.cid)),
  )
  handleSafe(IPC.BiliResolve, (_e, payload: { input: string }) =>
    wrap(() => api.resolve(payload.input)),
  )

  // —— 登录 ——
  handleSafe(IPC.BiliQrGenerate, () => wrap(() => auth.generateQr()))
  handleSafe(IPC.BiliQrPoll, (_e, payload: { qrcodeKey: string }) =>
    wrap(() => auth.pollQr(payload.qrcodeKey)),
  )
  handleSafe(IPC.BiliSmsSend, (_e, payload: { phone: string }) =>
    wrap(() => ({ sent: false, message: `短信登录暂不支持：${payload.phone} 需人机验证` })),
  )
  handleSafe(IPC.BiliSmsLogin, (_e, payload: { phone: string; code: string }) =>
    wrap(() => auth.loginBySms(payload.phone, payload.code)),
  )
  handleSafe(IPC.BiliCookieLogin, (_e, payload: { cookie: string }) =>
    wrap(() => auth.loginByCookie(payload.cookie)),
  )
  handleSafe(IPC.BiliLogout, () =>
    wrap(async () => {
      await auth.logout()
      return true
    }),
  )
  handleSafe(IPC.BiliAuthState, () => wrap(() => auth.getState()))

  // —— 账号数据 ——
  handleSafe(IPC.BiliFavorites, () => wrap(() => api.getFavorites()))
  handleSafe(IPC.BiliSubscriptions, () => wrap(() => api.getSubscriptions()))

  // —— 歌词 ——
  handleSafe(IPC.LyricsSearch, (_e, payload: { title: string; artist?: string }) =>
    wrap(() => lyricsService.search(payload.title, payload.artist)),
  )
  handleSafe(IPC.LyricsFetch, (_e, payload: { source: string; songId: string }) =>
    wrap(() => lyricsService.fetch(payload.source, payload.songId)),
  )

  // —— 导入 ——
  handleSafe(IPC.Import, (_e, payload: { source: 'netease' | 'qq'; url: string }) =>
    wrap(() => importers.import(payload.source, payload.url)),
  )
}
