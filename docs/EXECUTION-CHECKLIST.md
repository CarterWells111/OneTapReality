# OneTapReality 执行检查表

本文件记录当前有效的交付门槛，不重写历史阶段的完成记录。历史方案请看 `docs/DECISIONS.md`；Alpha 的独立环境与停测流程请看 `docs/operations/ALPHA-STAGING.md`。

## 协作与合并

- [x] Git origin 指向 `CarterWells111/OneTapReality`。
- [x] GitHub Actions 对 pull request、`main` push 与手动触发执行干净安装、lint、typecheck、完整测试与 server build。
- [x] 只有通过 pull request 的变更可合并到 `main`；不得使用裸 `git push --force`，确需覆盖远端时仅可用 `--force-with-lease` 并取得负责人明确许可。
- [x] 应用名称、包标识与现有 TestFlight 应用连续性已记录在 `docs/DECISIONS.md`。

## 代码与安全基线

- [x] 本地旅行册默认保存在设备；用户主动发布礼品时才把共享快照与照片上传到私有存储。
- [x] 服务端账号会话、礼品访问名单、邮件验证码、请求日志脱敏与礼品停用流程均有自动测试覆盖。
- [x] `GIFT_SHARING_ENABLED` 是立即停测开关；关闭后阻止新验证码、认领、发布与礼品读取，管理员停用接口仍可用于处置。
- [x] 依赖或 Expo/生产构建变更必须同步验证 `npm ci`、`npm run lint`、`npm run typecheck`、`npm run test:ci` 和 `npm run build:server`。

## iOS 独立 staging 准入（外部前置条件）

- [x] `staging.onetapreality.com` 与 `api-staging.onetapreality.com` 已解析，iOS AASA 匹配现有 Team ID 与 Bundle ID，并通过 HTTPS 验证。
- [x] Railway staging 服务、PostgreSQL、私有 R2 bucket 和 Resend 配置均与生产隔离，且使用独立 peppers、清理密钥和管理员测试邮箱。
- [x] `ALPHA_ALLOWED_EMAILS` 只包含获准内测邮箱；`GIFT_URL_ORIGIN=https://staging.onetapreality.com`，测试卡不含正式礼品 URL 或 token。
- [ ] 已从干净的最新 `main` 通过本地质量门禁和 `npm run beta:preflight:ios`，并经单独批准生成指向 staging 的 iOS EAS `alpha` 内部构建或 `staging-testflight` TestFlight 内部构建。
- [ ] `staging-testflight` 构建前已只读核对 EAS `preview` environment 的变量名称，无 production origin、数据库连接或客户端不应持有的服务端 Secret；提交前已确认内部群组 `OneTapReality开发员测试` 存在且该目标群组已启用自动分发，并确认其他内部群组均未启用自动分发。
- [ ] 三张 iOS 实体测试卡完成：准确写入、读回、锁屏碰卡、深链、邮箱登录、认领、发布、受邀只读、停用和对象删除；全程未访问生产数据库、bucket 或礼品。
- [ ] 已演练 P0 处置：关闭 `GIFT_SHARING_ENABLED`、停止发卡/邀请、移除受影响 TestFlight 测试者、停用礼品、保留脱敏证据、修复回归并经负责人批准后恢复。

本地质量门禁、iOS 预检和前三项环境隔离检查通过后，可单独申请生成并安装一个仅用于 staging 演练的 `alpha` ad-hoc 构建，或申请生成、提交并加入明确标记为 `Staging` 的 `staging-testflight` TestFlight 内部构建，供获准人员完成三卡与 P0 验收。两种路径都只连接 staging；TestFlight 路径的云构建与 App Store Connect 提交必须分别批准，且不得添加外部测试者。该内部演练不代表 production 或公开 App Store 放行；只有三卡与 P0 项也完成后，才可申请扩大内部发放。现有指向生产 API 的 TestFlight 构建不能代替这项隔离验收。

> 2026-08-06 状态：本地 `main` 已同步 `origin/main`；Railway staging Service + PostgreSQL、R2 staging bucket、`staging.onetapreality.com` / `api-staging.onetapreality.com` 域名与深链文件、Resend 邮件测试均已建立并验证（`/api/health` 200、`verify:backend` 全绿、`verify-r2` 通过、AASA 200 `application/json`、`/activate` 与 `/gift/*` 引导页 200 无 token 泄漏、验证码邮件可达、白名单外 403）。其余准入项（EAS alpha 构建、实体卡演练）仍为 Blocked，证据模板与隔离矩阵见 `docs/operations/REHEARSAL-RECORD.md`，阻塞项见 `docs/operations/DEPLOYMENT-LOG.md`。未绿灯前不发放 alpha 构建与 staging 测试卡。
> 四周计划第 1–2 周的首批 Beta 仅支持 iPhone / iOS。Android App Links 不属于前两周准入门槛，release SHA-256、`assetlinks.json` 与 Android 真机验收在第 3–4 周重新评估并保持非阻塞 Backlog；不得对外宣称 Android 已通过。Railway staging、PostgreSQL、R2、staging 域名、iOS AASA、网页引导、Resend 与白名单已完成；当前开放项只剩获批的 iOS staging 原生构建（`alpha` 或 `staging-testflight`）、三张实体卡全流程和 staging P0 演练。
