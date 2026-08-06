# 第 1 周 Alpha staging 端到端演练记录（脱敏）

> 本记录只保存可共享的时间、环境、卡批次、状态码、构建号与脱敏截图链接。不得记录 secret、数据库 URL、完整礼品 URL/token、验证码、个人照片或完整邮箱名单。
> 责任与边界：发布负责人独占 Railway、PostgreSQL、R2、Resend、EAS、DNS 与 TestFlight 写入；硬件只提供批次与抽检状态。

> 2026-08-06 进度：Railway staging Service + PostgreSQL 与 R2 staging bucket 已建立；`/api/health` 200（`database:ok`、`schemaVersion:7`）、`verify:backend` 全绿。其余项见 `docs/operations/DEPLOYMENT-LOG.md` 阻塞矩阵。

## 环境隔离矩阵

| 维度 | production | staging（目标） | 状态 |
| --- | --- | --- | --- |
| API Service | 生产 Railway Service | `onetapreality-staging.up.railway.app`（独立 Railway Service） | ✅ 已建立并通过 health 检查 |
| PostgreSQL | 生产数据库 | `OneTapStagingDB`（独立，`RUN_DB_MIGRATIONS=true`） | ✅ 已建立，schemaVersion 7 |
| R2 bucket | 生产私有 bucket | `onetapreality-staging`（域名账号内独立私有 bucket，token 已轮换） | ✅ 已建立（连通性待 `verify-r2` 确认） |
| 域名 | `onetapreality.com` | `staging.onetapreality.com`（礼品链接）/ `api-staging.onetapreality.com`（API） | 待解析 |
| Secrets | 生产 peppers / 清理密钥 / Resend key | 独立 `DEVICE_TOKEN_PEPPER` / `GIFT_TOKEN_PEPPER` / `GIFT_AUTH_PEPPER` / `GIFT_CARD_CLEANUP_SECRET` / R2 凭据（Resend 待配） | ✅ 已配置（值脱敏） |
| 发件人 | `support@onetapreality.com` | `staging@onetapreality.com`（单独验证） | 待配置 |
| 邮箱白名单 | 空（不限制） | `ALPHA_ALLOWED_EMAILS` 仅含获准测试邮箱 | 待确认内容 |
| 停测开关 | `GIFT_SHARING_ENABLED=true` | `GIFT_SHARING_ENABLED=true`（演练时临时 `false`） | 待配置 |
| Gift URL 来源 | `GIFT_URL_ORIGIN=https://onetapreality.com` | `GIFT_URL_ORIGIN=https://staging.onetapreality.com` | 待确认值 |

## 演练步骤与结果

| # | 步骤 | 预期 | 结果 | 证据（构建号/状态码/链接） |
| --- | --- | --- | --- | --- |
| 1 | 写卡/碰卡 | Developer NFC Console 写入 staging 礼品 URL，读回验证，iPhone 碰卡打开 App | 待执行 | |
| 2 | 深链 | `/gift/<token>` 进入正确 App 路由；AASA 生效 | 待执行 | |
| 3 | 邮箱登录 | 白名单邮箱收到验证码并可登录；非白名单邮箱返回 `beta_invite_required` 且不发码 | 待执行 | |
| 4 | 认领 | 首位登录者认领成功并成为 owner | 待执行 | |
| 5 | 发布 | 发布共享相册；媒体上传到 staging 私有 R2 bucket | 待执行 | |
| 6 | 受邀查看 | 受邀邮箱只读查看相册；非成员邮箱无权限 | 待执行 | |
| 7 | 停用 | owner 停用礼品；共享媒体不可再读取 | 待执行 | |
| 8 | 对象删除 | 维护端点/Worker 清理后，R2 对象 `getObjectMetadata` 返回不存在 | 待执行 | |
| 9 | P0 停测开关 | `GIFT_SHARING_ENABLED=false` 后新验证码/认领/发布/读取暂停，管理员停用仍可用；回归后恢复 `true` | 待执行 | |
| 10 | 环境隔离确认 | 全程未访问生产数据库、bucket 或礼品；测试卡内只有 staging URL | 待执行 | |

## P0 处置演练

按 `docs/operations/ALPHA-STAGING.md` 执行：关闭 `GIFT_SHARING_ENABLED` → 停止发卡/邀请 → 移除受影响 TestFlight 测试者 → 停用受影响礼品 → 保留脱敏证据 → 修复回归 → 发布负责人批准后恢复。

## 周会结论

- [ ] 环境：staging 端到端演练通过；production 与 staging 数据、bucket、secret 均隔离
- [ ] 样卡：3 张内部样卡完成 iPhone 碰卡与流程抽检（硬件批次表）
- [ ] 质量：候选代码通过四门禁（PR/CI 链接）
- [ ] 放行：四项全绿才允许首批 5 套收款与生产卡写入；任一红灯 → no-go
