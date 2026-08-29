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

## iOS staging 与外部 Beta 已完成门槛

- [x] `staging.onetapreality.com` 与 `api-staging.onetapreality.com` 已解析，iOS AASA 匹配现有 Team ID 与 Bundle ID，并通过 HTTPS 验证。
- [x] Railway staging 服务、PostgreSQL、私有 R2 bucket 和 Resend 配置均与生产隔离，且使用独立 peppers、清理密钥和管理员测试邮箱。
- [x] `ALPHA_ALLOWED_EMAILS` 只包含获准内测邮箱；`GIFT_URL_ORIGIN=https://staging.onetapreality.com`，测试卡不含正式礼品 URL 或 token。
- [x] 已从干净的 `main` 完成 `alpha` ad-hoc 构建和 `staging-testflight` TestFlight 内部构建，并通过 iOS staging 原生验证及外部 Beta 放行门禁；云构建与 App Store Connect 提交必须分别批准。
- [x] 外部 TestFlight 已发布，`beta-external` 仅连接 staging，未开放公共链接且未授予测试者 App Store Connect 权限。
- [x] 三张 iOS 实体测试卡完成：准确写入、读回、锁屏碰卡、深链、邮箱登录、认领、发布、受邀只读、停用和对象删除；全程未访问 production 数据库、bucket 或礼品。
- [x] P0 停测与恢复边界已记录；真实事件仍须由负责人批准后执行远端处置。

当前产品仅支持 iPhone / iOS；Android 不在当前及可预见产品计划内。外部 Beta 不代表 production 或公开 App Store 放行，后续构建、上传、群组变更及公开发布仍分别审批。

## 外部 Beta 首月真实用户观察

- [ ] 按 [`EXTERNAL-BETA-OBSERVATION.md`](operations/EXTERNAL-BETA-OBSERVATION.md) 每天北京时间 09:00 形成 staging 优先的只读简报。
- [ ] 每周一北京时间 09:15 完成七日趋势复盘；首月累计至少 28 天完整日报和 4 次周报。
- [ ] 预计 10–20 位真实用户期间保持 0 个 P0、无超过 24 小时未处理的 P1，且无维护中断超过 2 小时、未解决死信、持续积压或账号删除超期。
- [ ] 外部 Beta 始终只访问 staging；无 production 数据访问、Secret 泄漏或未批准的新费用项目。
- [ ] 月末覆盖本地相册、登录、NFC、认领、owner/viewer/editor、发布、停用恢复、举报/屏蔽及账号删除，并形成继续、修复后继续或暂停的结论。
