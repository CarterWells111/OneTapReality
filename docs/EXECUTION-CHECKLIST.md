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

## Alpha 独立 staging 准入（外部前置条件）

- [ ] `staging.onetapreality.com` 与 `api-staging.onetapreality.com` 已解析，并分别提供匹配现有 iOS Team ID/Android 签名的 AASA 和 `assetlinks.json`。
- [ ] Railway staging 服务、PostgreSQL、私有 R2 bucket 和 Resend 配置均与生产隔离，且使用独立 peppers、清理密钥和管理员测试邮箱。
- [ ] `ALPHA_ALLOWED_EMAILS` 只包含获准内测邮箱；`GIFT_URL_ORIGIN=https://staging.onetapreality.com`，测试卡不含正式礼品 URL 或 token。
- [ ] 已在 iOS 和 Android 实体测试卡上完成：碰卡、深链、邮箱登录、认领、发布、受邀只读、停用和对象删除；全程未访问生产数据库、bucket 或礼品。
- [ ] 已演练 P0 处置：关闭 `GIFT_SHARING_ENABLED`、停止发卡/邀请、移除受影响 TestFlight 测试者、停用礼品、保留脱敏证据、修复回归并经负责人批准后恢复。

只有所有 staging 准入项完成后，才可发放 `alpha` EAS 构建和 staging 测试卡。现有指向生产 API 的 TestFlight 构建不能代替这项隔离验收。

> 2026-08-06 状态：本地 `main` 已同步 `origin/main`；Railway staging Service + PostgreSQL 与 R2 staging bucket 已建立，`/api/health` 200（schemaVersion 7）、`verify:backend` 全绿、`verify-r2` 连通性通过。其余准入项仍为 Blocked，证据模板与隔离矩阵见 `docs/operations/REHEARSAL-RECORD.md`，阻塞项见 `docs/operations/DEPLOYMENT-LOG.md`。未绿灯前不发放 alpha 构建与 staging 测试卡。
