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

## 生产区域迁移脱敏记录模板

- Issue：#
- 源/目标区域：
- 写冻结开始/结束时间：
- 备份与恢复校验：通过 / 未通过
- `verify:migration`：通过 / 未通过
- API 域名切换时间：
- 三地三网聚合结果：
- 24 小时 / 第 7 天观察：
- 数据保持回滚状态：未触发 / 已完成

## 2026-09-03：production 中国大陆访问入口迁移

- 环境：production
- 服务：Railway API / PostgreSQL / Cloudflare 静态 Worker、DNS 与域名绑定
- 批准：发布负责人已在执行时逐项批准备份、恢复、API 域名切换、静态站迁移与根域名绑定；未提供关联 Issue 编号，不补写或猜测编号。
- 变更摘要：生产 API 与 PostgreSQL 已迁至 Railway 新加坡环境；完整恢复校验后保留原有会话、账号、NFC 礼品、权限与 R2 引用。官网从旧 OpenAI Sites 入口迁至 Cloudflare 静态 Worker，并直接绑定生产根域名，移除造成旧入口优先匹配的根域名旧记录。
- 验证证据（脱敏）：最终恢复校验显示应用表计数与完整性检查匹配、孤儿检查为零；`GET /api/health` 返回 HTTP 200、`database=ok`、`schemaVersion=14`、`writeFreeze=false`。官网首页、支持页、隐私页、AASA、`/activate` 与 token-safe 礼品回退页均为 HTTP 200；`www` 单跳规范化至根域名；响应不包含旧入口标识。
- 数据与安全边界：未记录或提交数据库连接串、备份文件位置/口令、secret、token、邮箱、IP、媒体或用户数据。R2 bucket 与对象未复制、删除或重建；邮箱、staging、API 子域及其他 DNS 记录未变更。
- 回滚动作：若静态官网异常，恢复一个经验证的静态入口并复测公共路径；不通过 DNS 或官网变更回滚数据库。若 API 需回滚，必须先冻结新环境写入、备份并验证新数据后再执行数据保持迁回。
- 最终状态：成功；中国大陆真实网络验证持续观察中。

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
- 批准：发布负责人在本次 Codex 任务中明确批准删除与部署；未提供关联 Issue 编号，不补写或猜测编号。
- 执行：2026-08-31 07:41 BST（Europe/London）前完成。Railway staging API 删除 `ALPHA_ALLOWED_EMAILS` 并成功部署；`GIFT_ADMIN_EMAILS` 保持配置，未修改 R2、Resend、EAS、TestFlight 或 production。
- Railway 伴随行为：项目级应用配置时同时应用 staging PostgreSQL 的 TCP Proxy 应用端口 `5432` 与 Railway 生成的 `DATABASE_PUBLIC_URL`，数据库完成滚动重部署并恢复 Online；未执行 migration、SQL 或数据写入。
- 验证：`GET /api/health` 返回 HTTP 200、`database=ok`、`schemaVersion=14`；此前不在四人开发者名单的受控邮箱成功收取验证码并登录，未在记录中保存邮箱、验证码或会话。服务端管理员与礼品访问隔离继续由自动测试覆盖，本次未使用真实未授权礼品做额外读取尝试。
- production：只读核对确认未因本次操作重部署，当前 active deployment 仍为 PR #81；production 原本即未设置 `ALPHA_ALLOWED_EMAILS`，本次未修改其变量或服务。
- 事件处置：紧急事件先设置 `GIFT_SHARING_ENABLED=false`。仍服务 external Beta 的同一 staging 不得直接恢复四人名单；只有先暂停 external Beta，或迁移至另一个单独批准的受限环境并记录新决策后，才允许恢复 allowlist。
