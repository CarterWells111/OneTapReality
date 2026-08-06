# OneTapReality 部署记录

每一次 staging 或 production 的外部服务变更都在对应“外部运维变更” Issue 中关联一份下列记录。先取得发布负责人批准，再执行写入；P0 先按运行手册停测。

```markdown
## 部署记录

- Issue：#
- 时间（含时区）：
- 负责人：
- 批准人：
- 环境：local / staging / production
- 服务：Railway API / PostgreSQL / Cloudflare Workers Cron / Cloudflare R2 / Resend / EAS 或 Expo / Cloudflare DNS 或深链文件 / TestFlight 或 App Store Connect
- 变更摘要：
- 验证证据（脱敏）：
- 回滚动作：
- 最终状态：成功 / 已回滚 / 停测 / 待跟进
- 后续工作：
```

不得记录 secret、数据库 URL、完整礼品 URL/token、验证码、个人照片、完整邮箱名单或原始敏感日志。证据仅保留可共享的时间、构建号、环境、状态码、健康检查结果和脱敏链接。

## 2026-08-06：staging 外部前置条件清单（发布负责人）

> 下列每项完成时补写 Issue、时间、验证证据与回滚动作；未完成项维持 Blocked 状态并在周会声明。

| 项 | 目标值 | 状态 | 解除负责人/截止 | 证据 |
| --- | --- | --- | --- | --- |
| Railway staging Service + PostgreSQL | 独立服务与数据库，`DATABASE_URL` 使用引用变量 | Blocked | 发布负责人 | 待填 |
| 独立 peppers 与清理密钥 | `DEVICE_TOKEN_PEPPER` / `GIFT_TOKEN_PEPPER` / `GIFT_AUTH_PEPPER` / `GIFT_CARD_CLEANUP_SECRET` | Blocked | 发布负责人 | 待填 |
| R2 staging bucket | 独立私有 bucket + 最小权限凭据 | Blocked | 发布负责人 | 待填 |
| 域名与深链文件 | `staging.onetapreality.com` / `api-staging.onetapreality.com` + AASA；Android `assetlinks.json` 待 release SHA-256 | Blocked | 发布负责人 | 待填 |
| Resend 测试配置 | 独立 key + `staging@onetapreality.com` 已验证 | Blocked | 发布负责人 | 待填 |
| 邮箱白名单 | `ALPHA_ALLOWED_EMAILS` 仅含获准测试邮箱 | Blocked | 发布负责人 | 待填 |
| EAS alpha 构建 | `npx eas-cli@latest build -p ios --profile alpha` | Blocked | 发布负责人 | 待填 |
| 3 张内部样卡 | 可供 staging 演练（硬件批次表） | Blocked | 硬件 | 待填 |

回滚原则：任何一项变更失败时按 `ALPHA-STAGING.md` 恢复；暂停分享先置 `GIFT_SHARING_ENABLED=false`。
