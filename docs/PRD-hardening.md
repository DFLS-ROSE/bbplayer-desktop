# BBPlayer 桌面端 生产级加固 · 增量 PRD

> 文档类型：增量 PRD（仅描述变更/加固部分，不重复 MVP 已有功能）
> 配套文档：`docs/PRD.md`（MVP）、`docs/ARCHITECTURE.md`（现状架构）

## 项目信息

| 项 | 内容 |
|---|---|
| 产品名称 | BBPlayer Desktop |
| 项目名称 | `bbplayer_desktop` |
| 技术栈 | Electron + React + TypeScript（沿用现状，不更换） |
| 目标平台 | Windows / macOS / Linux |
| 语言 | 中文（用户语言） |
| 原始需求复述 | 客户要求面向「相当数量用户群体」的**生产级、0 容忍缺陷**发布，需对已交付 MVP 做一轮彻底加固：安全、网络健壮性、稳定性、已知缺陷清零、发布/合规、工程化六类 |

---

## 一、加固目标

**一句话**：把 BBPlayer 桌面端从「可用 MVP」提升为「可面向海量用户分发、0 已知缺陷、0 高危安全项、可自动更新」的生产级产品。

**三条可验收质量指标**：

1. **零已知缺陷**：主理人审计确认的 4 个已知缺陷全部清零，P0/P1 加固项无遗留，全量回归测试通过率 100%。
2. **安全基线达标**：第三节「安全与合规基线清单」10/10 项全命中，无高危项；`sandbox: true` 与收紧后 CSP 经自动化校验通过。
3. **可自动更新**：发布产物完成代码签名（macOS 含公证），electron-updater 链路在 Windows / macOS 各完成一次端到端升级验证。

---

## 二、加固需求池

> 优先级：P0 = 必须（0 容忍）；P1 = 重要；P2 = 增强。
> 每条需求遵循「现状 → 目标 → 验收标准」。

### P0（必须，0 容忍）

#### 安全类

**H-01 渲染进程开启沙箱**
- 现状：`window-manager.ts` 主窗口与歌词窗口均 `sandbox: false`。
- 目标：两窗口 `webPreferences.sandbox: true`；electron-vite 按需调整 preload 构建方式以兼容沙箱。
- 验收：主/歌词窗口 sandbox 均为 `true`；dev/prod 下现有功能全量可用；无沙箱相关运行时报错。

**H-02 CSP 加固**
- 现状：两个渲染入口已有基础 meta CSP，但过松（`connect-src`/`img-src` 允许 `http:`，`style-src 'unsafe-inline'`，缺 `object-src`/`base-uri`/`frame-src`）。
- 目标：收紧为最小权限（`script-src 'self'`；样式去除内联或限非内联；`connect-src`/`img-src` 仅 `https:` 或明确域名白名单；补 `object-src 'none'`、`base-uri 'none'`、`frame-src 'none'`），并在主进程 `session.webRequest.onHeadersReceived` 注入同策略响应头作纵深防御。
- 验收：两入口 CSP 通过收紧校验；无 `http:` 明文外联；DevTools 无 CSP violation；封面图/音频流经域名白名单后仍可正常加载。

**H-03 导航与窗口打开/权限拦截**
- 现状：仅主窗口有 `setWindowOpenHandler`，歌词窗口无；无 `will-navigate`/`will-redirect` 拦截；无 `setPermissionRequestHandler`。
- 目标：两窗口统一 `setWindowOpenHandler`（一律 deny，白名单 http/https 经 `shell.openExternal` 打开并校验协议）；两窗口 `will-navigate` 阻止跳离本地/自域；app 级 `setPermissionRequestHandler` 默认拒绝全部权限（摄像头/麦克风/通知/定位/媒体等），除非后续明确需要。
- 验收：任何 window.open/内链跳转/外部 URL 均被拦截或安全外开；权限请求默认拒绝且不弹系统授权；外部链接仅允许 http/https 协议。

**H-04 Cookie 过期检测与刷新**
- 现状：SESSDATA 经 safeStorage 加密落盘，但无过期检测；仅在 `fetchUserInfo` 显式调用时清空，运行中登录态失效无感知。
- 目标：启动时与请求返回鉴权失败码（如 `BILI_-101`）时主动校验登录态；过期/失效则清 Cookie、更新 AuthState、通知 UI 重登；建立 nav 探活 + 定期探测机制。
- 验收：SESSDATA 过期后 UI 在 ≤1 个探活周期内感知并提示重登；不出现「假登录」状态；过期 Cookie 不残留。

#### 网络健壮性

**H-05 请求超时与取消**
- 现状：`http-client.ts` 及 importer 直接使用 fetch，无 AbortController 超时、无请求取消。
- 目标：统一 HTTP 客户端接入 AbortController（默认超时 + 可配置），窗口关闭/组件卸载/重复请求时取消在途请求；importer 同步接入。
- 验收：任意请求超时后按超时错误返回（不永久挂起）；取消后不再触发回调；超时阈值可配置且默认合理（如 15s）。

#### 稳定性

**H-06 全局异常兜底**
- 现状：`main/index.ts` 无 `uncaughtException`/`unhandledRejection`/`render-process-gone` 处理。
- 目标：主进程注册三者处理器：写入结构化日志；`render-process-gone` 触发提示或自动恢复/重载；未捕获异常不静默吞掉。
- 验收：人为注入异常/崩溃后均有日志与兜底动作；`render-process-gone` 触发恢复流程；进程不静默退出。

**H-07 React ErrorBoundary**
- 现状：渲染层无 ErrorBoundary。
- 目标：主窗口/歌词窗口根部挂载 ErrorBoundary，捕获渲染错误显示降级 UI 并记录日志。
- 验收：渲染异常被捕获，显示友好错误页而非白屏；错误被结构化记录。

**H-08 统一结构化日志**
- 现状：仅散落 `console.warn/log`。
- 目标：引入统一日志模块（分级 info/warn/error、时间戳、上下文、可写文件 + 滚动截断），替换散落 console；错误带可追踪 ID。
- 验收：登录/播放/导入/IPC 关键链路均有结构化日志；日志可落盘滚动；可依据日志定位一次完整请求/崩溃上下文。

#### 已知缺陷清零

**H-09 拆分 `bili:authState` 通道**
- 现状：`IPC.BiliAuthState` 同时用于 invoke（查询当前态）与 push（主→渲染广播），语义混用。
- 目标：invoke 保留 `bili:authState`（查询）；push 拆为独立通道如 `bili:authChanged`；`shared/ipc.ts` 契约与 preload 同步更新。
- 验收：查询与广播通道分离；AuthState 变更仍能实时推送 UI；契约类型校验通过。

**H-10 修正 lyrics-parser SPL 检测正则**
- 现状：`hasWordTags` 用 `\d{1,2}:\d{1,2}` 判定 SPL，`parseWords` 用 `\d{1,3}` 解析，分钟数 100+ 的 SPL 被误判为 LRC。
- 目标：统一 SPL 检测与解析为 `\d{1,3}:\d{1,2}`（与 TAG_RE 一致），并补单测覆盖 3 位分钟边界。
- 验收：3 位分钟 SPL 正确识别为 `spl` 类型且逐字解析正确；新增单测通过。

**H-11 getSubscriptions 不再吞异常**
- 现状：`api.ts` 的 `getSubscriptions` 内层 try/catch 吞掉所有异常返回 `[]`。
- 目标：移除内层 catch，向上抛错交由 IPC `wrap` 转 Result；保留错误码区分「未登录/接口变更/网络」；仅对明确空结果返回空数组。
- 验收：订阅接口异常时 UI 收到明确错误而非静默空列表；正常空列表仍返回 `[]`。

**H-12 消除 library-store 双缓存**
- 现状：zustand `library-store` 与 react-query 同时缓存 playlists，写后需手动 invalidate，易不一致。
- 目标：单一数据源（react-query 为唯一缓存与读取源，zustand 仅保留 UI 选中态等非派生状态）；写操作统一走 mutation + invalidate。
- 验收：playlists 仅一处缓存来源；增删改后 UI 一致无陈旧数据；移除手动双写逻辑。

### P1（重要）

**H-13 有限重试与指数退避**
- 现状：无重试。
- 目标：幂等 GET 请求对瞬时错误（HTTP 5xx/超时/断网）限次重试（如 2 次）+ 指数退避；POST 不自动重试。
- 验收：瞬时失败可自动恢复；重试次数/退避可配置；有重试日志。

**H-14 并发/限流控制**
- 现状：无并发控制，订阅合集逐个请求、导入匹配无节流。
- 目标：引入每域并发上限与限流（如 B 站 API 最大并发 N、请求间隔）；导入匹配分片批量而非逐条。
- 验收：并发峰值受控；无因高频触发的风控/限流错误；配置可调。

**H-15 依赖安全审计**
- 现状：无依赖漏洞审计与门禁。
- 目标：接入 `npm audit`（或 OSV）作为构建门禁，锁定高危依赖；制定依赖升级策略；生成 SBOM（可选）。
- 验收：CI 中 audit 0 高危；package-lock 纳入版本管理。

**H-16 自动更新（electron-updater）**
- 现状：无自动更新。
- 目标：接入 electron-updater，Windows（NSIS）/macOS（dmg+zip 差分）增量更新，含更新检查、下载、校验、重启安装与失败回退。
- 验收：端到端从旧版本触发更新到新版本成功；签名校验通过；更新失败可回退且不损坏安装。

**H-17 代码签名与公证**
- 现状：`electron-builder.yml` 无签名/公证配置。
- 目标：Windows 代码签名证书接入；macOS Developer ID 签名 + notarize（afterSign/notarize 配置）；Linux 至少提供校验和。
- 验收：Win 产物无 SmartScreen 未签名告警；mac 产物公证通过、Gatekeeper 不拦截；签名证书信息正确。

**H-18 隐私政策与免责声明**
- 现状：无隐私政策/免责声明；外部歌单导入涉及第三方抓取与自动匹配。
- 目标：提供隐私政策（数据采集/存储/Cookie 用途）+ 免责声明（第三方歌单导入的版权与合规边界、仅供个人学习）；首次启动/首次导入时明示确认。
- 验收：应用内可查看隐私政策与免责声明；首次导入第三方歌单有确认弹窗；文案经法务/合规确认。

### P2（增强）

**H-19 崩溃上报（Sentry 预留）**
- 现状：无崩溃上报。
- 目标：接入 Sentry（主进程 + 渲染进程），采样上报未捕获异常与崩溃，含版本/平台上下文；提供 DSN 注入与开关。
- 验收：崩溃事件在 Sentry 后台可见且含堆栈/版本；可配置关闭/采样率。

**H-20 多语言 i18n**
- 现状：界面硬编码中文。
- 目标：引入 i18n（i18next/react-i18next），文案抽离，首发至少中/英。
- 验收：语言切换即时生效且无硬编码残留；新增文案走翻译 key。

**H-21 CI/CD 预留**
- 现状：无 CI/CD。
- 目标：提供 CI 配置（typecheck + test + audit + build 门禁）与发布流水线（打包 + 签名 + 上传更新源）。
- 验收：PR 触发门禁自动跑；发布产物自动构建签名；更新源自动生成 latest.yml。

---

## 三、安全与合规基线清单

生产级桌面应用必须满足（逐项验收，目标 10/10 命中）：

1. **渲染沙箱**：所有 BrowserWindow `sandbox: true`。
2. **上下文隔离**：`contextIsolation: true` + `nodeIntegration: false`（现状已满足，保持）。
3. **CSP**：收紧 meta CSP + 响应头 CSP 双保险，`script-src 'self'`，补 `object-src`/`base-uri`/`frame-src`。
4. **导航拦截**：`will-navigate`/`will-redirect` 阻止外跳，`setWindowOpenHandler` 全覆盖。
5. **权限拦截**：`setPermissionRequestHandler` 默认拒绝全部权限。
6. **外链安全**：`shell.openExternal` 仅允许 http/https 白名单协议。
7. **敏感数据**：Cookie 用 safeStorage 加密落盘，明文不落盘；无 keyring 时降级需告警提示。
8. **preload 最小化**：contextBridge 只暴露白名单 API，不暴露原始 ipcRenderer；IPC payload 运行时校验。
9. **IPC 来源校验**：handler 校验 `event.senderFrame` 来源，拒绝未知/外部 frame。
10. **隐私合规**：隐私政策 + 免责声明 + 首次确认；第三方抓取边界明示。

---

## 四、待确认问题

1. **短信登录**：是否本期接入 geetest 人机验证（当前为占位报错）？若接入需 geetest 联调与风控策略确认。
2. **崩溃上报选型**：Sentry（自建/官方 SaaS）还是其他服务？DSN 与数据脱敏（不采集 Cookie/明文）如何约束？
3. **签名证书**：Windows/macOS 签名证书由谁提供？费用与申请周期？若证书未就绪，H-16/H-17 是否可后置发布？
4. **多语言首发**：是否需要首发中英双语，还是中文首发、后续补多语言？
5. **Cookie 刷新策略**：是否接受「探活周期」方案（定期 nav 探测）？B 站 SESSDATA 无法静默刷新，过期后是强制重登还是保留只读模式，需明确。
6. **CSP 收紧与内联样式**：现有 `style-src 'unsafe-inline'` 是否可移除（tailwind 生成 class 无需内联，但主题装扮可能注入内联样式，需确认）。
7. **崩溃恢复策略**：`render-process-gone` 后自动 reload 还是提示用户？自动 reload 是否丢播放进度（需结合断点续播）。
8. **自动更新源托管**：更新包托管在哪（GitHub Releases / 自建 OSS / CDN）？是否需要灰度/分渠道更新？
