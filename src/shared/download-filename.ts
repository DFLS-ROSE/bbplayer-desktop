// ============================================================================
// 下载文件名处理（纯函数，主进程与测试共用）
//
// Windows 文件名非法字符：< > : " / \ | ? * 以及控制字符；
// 另外结尾的点和空格会被系统静默去掉，文件名以这些结尾会导致写入路径与预期不符。
// ============================================================================

/** 文件名净化：去掉非法字符、折叠空白、去掉结尾的点与空格、限制长度 */
export function sanitizeFileName(name: string, maxLen = 120): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    // 结尾的点和空格在 Windows 上会被静默去掉
    .replace(/[. ]+$/, '')
  return cleaned.slice(0, maxLen) || 'unknown'
}

/** 由曲目信息拼出下载文件名：歌手 - 标题.m4a */
export function buildFileName(artist: string, title: string): string {
  return `${sanitizeFileName(`${artist} - ${title}`)}.m4a`
}
