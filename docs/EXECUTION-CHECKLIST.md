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

## iOS Alpha 独立 staging 准入（外部前置条件）

- [x] `staging.onetapreality.com` 与 `api-staging.onetapreality.com` 已解析，iOS AASA 匹配现有 Team ID 与 Bundle ID，并通过 HTTPS 验证。
- [x] Railway staging 服务、PostgreSQL、私有 R2 bucket 和 Resend 配置均与生产隔离，且使用独立 peppers、清理密钥和管理员测试邮箱。
- [x] `ALPHA_ALLOWED_EMAILS` 只包含获准内测邮箱；`GIFT_URL_ORIGIN=https://staging.onetapreality.com`，测试卡不含正式礼品 URL 或 token。
- [ ] 已从干净的最新 `main` 通过本地质量门禁和 `npm run beta:preflight:ios`，并经单独批准生成指向 staging 的 iOS EAS `alpha` 原生构建。
- [ ] 三张 iOS 实体测试卡完成：准确写入、读回、锁屏碰卡、深链、邮箱登录、认领、发布、受邀只读、停用和对象删除；全程未访问生产数据库、bucket 或礼品。
- [ ] 已演练 P0 处置：关闭 `GIFT_SHARING_ENABLED`、停止发卡/邀请、移除受影响 TestFlight 测试者、停用礼品、保留脱敏证据、修复回归并经负责人批准后恢复。

本地质量门禁、iOS 预检和前三项环境隔离检查通过后，可单独申请生成并安装一个仅用于 staging 演练的 `alpha` 内部构建，供获准人员完成三卡与 P0 验收；不得扩大到 TestFlight、production 或更多测试成员。只有三卡与 P0 项也完成后，才可申请扩大内部发放。现有指向生产 API 的 TestFlight 构建不能代替这项隔离验收。

> 四周计划第 1–2 周的首批 Beta 仅支持 iPhone / iOS。Android App Links 不属于前两周准入门槛，release SHA-256、`assetlinks.json` 与 Android 真机验收在第 3–4 周重新评估并保持非阻塞 Backlog；不得对外宣称 Android 已通过。Railway staging、PostgreSQL、R2、staging 域名、iOS AASA、网页引导、Resend 与白名单已完成；当前开放项只剩 iOS EAS `alpha` 构建、三张实体卡全流程和 staging P0 演练。
