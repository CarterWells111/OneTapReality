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
| Railway staging Service + PostgreSQL | 独立服务与数据库，`DATABASE_URL` 使用引用变量 | 已完成 | 发布负责人 | `https://onetapreality-staging.up.railway.app`；`/api/health` 200、`database:ok`、`schemaVersion:7`；`verify:backend` = {"health":200,"register":201,"create":201,"list":200,"delete":204}（2026-08-06） |
| 独立 peppers 与清理密钥 | `DEVICE_TOKEN_PEPPER` / `GIFT_TOKEN_PEPPER` / `GIFT_AUTH_PEPPER` / `GIFT_CARD_CLEANUP_SECRET` | 已完成（值脱敏） | 发布负责人 | Railway Variables 截图核对变量齐全，含 `RUN_DB_MIGRATIONS=true`（2026-08-06） |
| R2 staging bucket | 独立私有 bucket + 最小权限凭据 | 已完成 | 发布负责人 | bucket 名称 `onetapreality-staging`；因初建在非域名账号，已于 2026-08-06 在域名账号重建并轮换 API token；`node scripts/verify-r2.cjs` 输出 `{"ok":true,...}`（上传/读取/删除通过，测试对象已清理） |
| 域名与深链文件 | `staging.onetapreality.com` / `api-staging.onetapreality.com` + AASA；Android `assetlinks.json` 待 release SHA-256 | Partial（Android release 指纹阻塞） | 发布负责人 | `api-staging` 已解析并接入 Railway（health 200）；`staging.onetapreality.com` 已绑定 Cloudflare Pages 项目 `onetapreality-staging`（生产分支 `main`）；AASA 200 `application/json`、`/activate` 与 `/gift/*` 引导页 200 且无 token 泄漏；Android release SHA-256 与 `assetlinks.json` 真机验证待完成（2026-08-06） |
| Resend 测试配置 | 独立 key + `staging@onetapreality.com` 已验证 | 已完成 | 发布负责人 | staging 独立 key + `GIFT_EMAIL_FROM=staging@onetapreality.com`；`/api/auth/request` 白名单邮箱 202 且收件箱收到验证码；非白名单邮箱 403 `beta_invite_required`（2026-08-06） |
| 邮箱白名单 | `ALPHA_ALLOWED_EMAILS` 仅含获准测试邮箱 | 已完成 | 发布负责人 | `ALPHA_ALLOWED_EMAILS` 含测试邮箱，白名单外邮箱统一 403 `beta_invite_required` 且不发信（2026-08-06） |
| EAS alpha 构建 | `npx eas-cli@latest build -p ios --profile alpha` | Blocked | 发布负责人 | 待填 |
| 3 张内部样卡 | 可供 staging 演练（硬件批次表） | Blocked | 硬件 | 待填 |

回滚原则：任何一项变更失败时按 `ALPHA-STAGING.md` 恢复；暂停分享先置 `GIFT_SHARING_ENABLED=false`。

## 2026-08-16：staging 礼品分享配置只读复核

- 环境：staging
- 服务：Railway API
- 核对结果：`GIFT_SHARING_ENABLED=true`、`GIFT_URL_ORIGIN=https://staging.onetapreality.com`，均符合预期。
- 安全边界：只输出预期/缺失/不匹配状态，未读取或记录 Secret、完整变量集或连接信息。
- 变更结果：未修改变量、未触发部署；无需回滚。
