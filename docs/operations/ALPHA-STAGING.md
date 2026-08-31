# Alpha staging 与 P0 运行手册

> 当前状态：本手册记录已完成的内部 Alpha 隔离验收。2026-08-30 起，外部 Beta 已取代本手册的邮箱白名单准入规则；同一 staging API 的 `ALPHA_ALLOWED_EMAILS` 保持未设置或空值。历史步骤不得用于重新限制正在运行的外部 Beta。

NFC 深链业务矩阵的本地生成、临时邮箱、清理和 PR 门禁见 `NFC-STAGING-LAB.md`；实体卡验收仍见 `IOS-NFC-CARD-TEST.md`。

## 访问边界

发布负责人独占 Railway、PostgreSQL、R2、Resend、EAS、DNS 与 App Store Connect 的写入权限。辅助开发、UI 和硬件协作者只通过 PR、测试结果和已脱敏的卡片编号协作，不获得任何生产或 staging secret。

## 创建 staging

1. 创建独立 Railway API Service 与 PostgreSQL，设置独立的 `DATABASE_URL`、`DEVICE_TOKEN_PEPPER`、礼品 peppers、清理密钥、R2 最小权限凭据、管理员测试邮箱及 `ALPHA_ALLOWED_EMAILS`。
2. 创建独立私有 R2 bucket；不得使用生产 bucket 或生产 access key。
3. 为 `staging.onetapreality.com` 配置 HTTPS 与匹配当前 iOS Team ID/Bundle ID 的 Apple App Site Association；服务端 `GIFT_URL_ORIGIN` 必须等于该域名。
4. 经单独批准后，用 `npx eas-cli@latest build -p ios --profile alpha` 生成 ad-hoc 内部构建，或按 TestFlight 手册用 `staging-testflight` profile 生成 store 构建并经另一项批准提交到内部群组。测试卡只写 staging URL。

当前产品仅支持 iPhone / iOS。Android 不在当前及可预见产品计划内，不配置 Android package、Asset Links、构建或真机验收。

## 首个 staging 演练构建

当前产品仅支持 iPhone / iOS。首次实体卡验收前，在环境隔离检查、本地质量门禁和 `npm run alpha:preflight:ios` 全部通过后，可以由发布负责人单独批准生成并安装一个仅用于 staging 演练的 `alpha` 或 `staging-testflight` 原生构建。`alpha` 通过登记 UDID 后的 EAS 链接安装；`staging-testflight` 显式使用 EAS `preview` environment，并只通过 App Store Connect 现有内部群组 `OneTapReality开发员测试` 安装，且云端构建和提交必须分别批准。该目标群组已启用自动分发；提交前还须确认其他内部群组均未启用自动分发。两者只发给获准演练人员，用于完成三张实体卡和 P0 流程；它们都不代表 production、公开 App Store 或扩大测试成员已获准。Android 不属于后续发布计划。

## 首次演练后的每次内部扩大发放前

- 在干净安装后运行 `npm run lint`、`npm run typecheck`、`npm run test:ci` 和 `npm run build:server`。
- 在 iPhone 与三张 staging 实体卡上完成：写入、读回、锁屏碰卡、深链、验证码、认领、发布、只读访问、停用、R2 对象删除。
- 历史 Alpha 验收曾确认 `ALPHA_ALLOWED_EMAILS` 仅含当时测试者；当前外部 Beta staging 以 `docs/EXECUTION-CHECKLIST.md` 的开放登录清单为准，`GIFT_SHARING_ENABLED=true`，并且没有生产 URL、token、照片或数据库数据出现在测试记录中。

## P0：立即停测

未授权访问、错误认领、token 泄露、媒体误公开或登录不可用均为 P0。依次执行：

1. 将 `GIFT_SHARING_ENABLED=false`；停止新卡写入和新邀请。
2. 停止分发内部构建或从适用的 TestFlight 测试组移除受影响人员，并停用受影响礼品。
3. 保留已脱敏的时间、卡号、请求状态和处置记录；不要保存 token、验证码或私人照片。
4. 修复后运行完整自动检查和 staging 端到端回归，由发布负责人审批后恢复开关。

## 密钥轮换

怀疑泄露时先暂停分享，再轮换受影响 Service 的 R2 凭据、Resend key、peppers 或清理密钥；不得把新值放入仓库、客户端变量或聊天记录。轮换后重新验证邮箱登录、礼品访问、签名 URL 和停用删除流程。
