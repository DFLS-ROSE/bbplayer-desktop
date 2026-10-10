// mac 公证占位脚本（H-17）
// 证书就绪后注入 APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID 环境变量即启用。
// 未配置时静默跳过，不阻塞构建。
module.exports = async function notarizeMac(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appleId = process.env.APPLE_ID
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD
  const teamId = process.env.APPLE_TEAM_ID

  if (!appleId || !appleIdPassword || !teamId) {
    console.log('[notarize] 未配置 Apple 公证凭证，跳过公证（占位）')
    return
  }

  try {
    const { notarize } = await import('@electron/notarize')
    await notarize({
      appBundleId: 'com.bbplayer.desktop',
      appPath: `${context.appOutDir}/BBPlayer.app`,
      appleId,
      appleIdPassword,
      teamId,
    })
    console.log('[notarize] 公证完成')
  } catch (err) {
    console.error('[notarize] 公证失败：', err)
    throw err
  }
}
