# Alpha staging 与 P0 运行手册

## 访问边界

发布负责人独占 Railway、PostgreSQL、R2、Resend、EAS、DNS 与 App Store Connect 的写入权限。辅助开发、UI 和硬件协作者只通过 PR、测试结果和已脱敏的卡片编号协作，不获得任何生产或 staging secret。

## 创建 staging

1. 创建独立 Railway API Service 与 PostgreSQL，设置独立的 `DATABASE_URL`、`DEVICE_TOKEN_PEPPER`、礼品 peppers、清理密钥、R2 最小权限凭据、管理员测试邮箱及 `ALPHA_ALLOWED_EMAILS`。
2. 创建独立私有 R2 bucket；不得使用生产 bucket 或生产 access key。
3. 为 `staging.onetapreality.com` 配置 HTTPS 与匹配当前 iOS Team ID/Bundle ID 的 Apple App Site Association；服务端 `GIFT_URL_ORIGIN` 必须等于该域名。
4. 用 `npx eas-cli@latest build -p ios --profile alpha` 生成 iOS 内部构建。测试卡只写 staging URL。

当前首批 Beta 仅支持 iPhone / iOS。Android Asset Links、release SHA-256 与 Android 真机验收属于后续非阻塞 Backlog，不得对外宣称已完成。

## 每次 Alpha 发布前

- 在干净安装后运行 `npm run lint`、`npm run typecheck`、`npm run test:ci` 和 `npm run build:server`。
- 在 iPhone 与三张 staging 实体卡上完成：写入、读回、锁屏碰卡、深链、验证码、认领、发布、只读访问、停用、R2 对象删除。
- 确认 `ALPHA_ALLOWED_EMAILS` 仅含当前测试者，`GIFT_SHARING_ENABLED=true`，并且没有生产 URL、token、照片或数据库数据出现在测试记录中。

## P0：立即停测

未授权访问、错误认领、token 泄露、媒体误公开或登录不可用均为 P0。依次执行：

1. 将 `GIFT_SHARING_ENABLED=false`；停止新卡写入和新邀请。
2. 停止分发内部构建或从适用的 TestFlight 测试组移除受影响人员，并停用受影响礼品。
3. 保留已脱敏的时间、卡号、请求状态和处置记录；不要保存 token、验证码或私人照片。
4. 修复后运行完整自动检查和 staging 端到端回归，由发布负责人审批后恢复开关。

## 密钥轮换

怀疑泄露时先暂停分享，再轮换受影响 Service 的 R2 凭据、Resend key、peppers 或清理密钥；不得把新值放入仓库、客户端变量或聊天记录。轮换后重新验证邮箱登录、礼品访问、签名 URL 和停用删除流程。
