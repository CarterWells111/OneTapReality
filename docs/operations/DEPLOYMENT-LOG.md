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
| iOS 域名与 Universal Links | `staging.onetapreality.com` / `api-staging.onetapreality.com` + AASA | 已完成 | 发布负责人 | `api-staging` 已解析并接入 Railway（health 200）；`staging.onetapreality.com` 已绑定 Cloudflare Pages；AASA 200 `application/json`，`/activate` 与 `/gift/*` 引导页 200 且无 token 泄漏（2026-08-06） |
| iOS-only 平台边界 | Android 不在当前及可预见产品计划内 | Closed | 发布负责人 | 已移除 Android package、构建入口与 `assetlinks.json`；仅验收 iPhone / iOS |
| Resend 测试配置 | 独立 key + `staging@onetapreality.com` 已验证 | 已完成 | 发布负责人 | staging 独立 key + `GIFT_EMAIL_FROM=staging@onetapreality.com`；`/api/auth/request` 白名单邮箱 202 且收件箱收到验证码；非白名单邮箱 403 `beta_invite_required`（2026-08-06） |
| 邮箱白名单 | `ALPHA_ALLOWED_EMAILS` 仅含获准测试邮箱 | 已完成 | 发布负责人 | `ALPHA_ALLOWED_EMAILS` 含测试邮箱，白名单外邮箱统一 403 `beta_invite_required` 且不发信（2026-08-06） |
| iOS staging / 外部 Beta 构建 | 仅连接 staging 的已批准 iOS 构建 | 已完成 | 发布负责人 | 外部 TestFlight 已发布；未开放公共链接 |
| 3 张内部样卡 | 使用 `IOS-STG-001` 至 `IOS-STG-003` 完成 staging 演练 | 已完成 | 硬件 / 发布负责人 | 实体 NFC 验收完成：写入、读回、锁屏、Universal Link 与角色生命周期通过（证据脱敏） |

回滚原则：任何一项变更失败时按 `ALPHA-STAGING.md` 恢复；暂停分享先置 `GIFT_SHARING_ENABLED=false`。

## 2026-08-16：staging 礼品分享配置只读复核

- 环境：staging
- 服务：Railway API
- 核对结果：`GIFT_SHARING_ENABLED=true`、`GIFT_URL_ORIGIN=https://staging.onetapreality.com`，均符合预期。
- 安全边界：只输出预期/缺失/不匹配状态，未读取或记录 Secret、完整变量集或连接信息。
- 变更结果：未修改变量、未触发部署；无需回滚。

## 2026-08-29：外部 Beta 进入首月观察

- 状态：三张实体 NFC 卡验收完成，外部 TestFlight 已发布并继续只连接 staging。
- 规模：未来一个月预计 10–20 位真实用户。
- 运行手册：[`EXTERNAL-BETA-OBSERVATION.md`](EXTERNAL-BETA-OBSERVATION.md)。
- 边界：本记录不授权新的构建、上传、部署、migration、维护 POST、只读角色、密码轮换或自动任务变更。

## 2026-08-31：staging 开放邮箱验证码登录

- 环境：staging
- 服务：Railway API
- 变更：仅移除 `ALPHA_ALLOWED_EMAILS`；不修改 `GIFT_ADMIN_EMAILS`、数据库、R2、Resend、EAS、TestFlight 或 production。
- 状态：待发布负责人批准并执行。
- 验证：执行后记录脱敏 health、受控非管理员邮箱登录和未授权礼品拒绝结果。
- 事件处置：紧急事件先设置 `GIFT_SHARING_ENABLED=false`。仍服务 external Beta 的同一 staging 不得直接恢复四人名单；只有先暂停 external Beta，或迁移至另一个单独批准的受限环境并记录新决策后，才允许恢复 allowlist。
