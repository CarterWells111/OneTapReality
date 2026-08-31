# Railway 部署

Railway 托管 Expo API Routes 的 Node server 和同项目 PostgreSQL；现有 App 仍以本地 SQLite 为唯一业务数据源，不会因为部署而自动同步。

## 仓库内置配置

- `railway.json`：build、由 `RUN_DB_MIGRATIONS=true` 控制的 pre-deploy migration、start 与 healthcheck。
- `npm run build:server`：执行 API-only Expo server export。
- `npm run db:migrate`：在发布新版本前应用 Drizzle migration。
- `npm run start:server`：启动 Expo Server 的 Express adapter。
- `/api/health`：Railway 健康检查路径。
- Node.js：`>=20.19.4`。

## 第一次配置

以下步骤都在同一个 Railway Project 中完成。

1. 点击 **New → Database → Add PostgreSQL**，等待 PostgreSQL Service 状态正常。默认服务名通常是 `Postgres`。
2. 打开从 GitHub 仓库创建的 API Service，而不是 PostgreSQL Service。
3. 进入 **Variables → New Variable → Add Reference**，变量名选择或填写 `DATABASE_URL`，引用 PostgreSQL Service 的 `DATABASE_URL`。结果应类似：

   ```env
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   ```

   如果数据库服务已改名，把 `Postgres` 换成界面显示的实际服务名。必须使用引用变量，不要复制公开连接地址或拆分配置 `PGHOST`、`PGPORT`。

4. 在 API Service 添加：

   ```env
   NODE_ENV=production
   DEVICE_TOKEN_PEPPER=<至少 32 字节的随机秘密>
   ```

   可在本机生成 pepper：

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

5. 不要手动设置 `PORT`，Railway 会注入。不要在后端服务设置 `EXPO_PUBLIC_API_ORIGIN`，也不要把 `DATABASE_URL` 或 pepper 放进任何 `EXPO_PUBLIC_` 变量。
6. 在 API Service 的 **Variables** 添加 `RUN_DB_MIGRATIONS=true`。在 API Service 的 **Settings** 确认仓库根目录没有被改到子目录。构建、pre-deploy 和启动命令由 `railway.json` 提供，一般无需手填。
7. 触发部署。日志应依次出现 server export、Drizzle migration 和 server listening；pre-deploy 失败时 API 新版本不会启动。
8. 进入 **Settings → Networking → Generate Domain**，生成公开 HTTPS 域名。

## 部署后验证

先访问：

```text
https://your-service.up.railway.app/api/health
```

应返回 HTTP 200，且 JSON 中包含 `"database":"ok"` 与不低于当前最低要求的 `"schemaVersion"`。若 migration 缺失，接口返回 `503 database_schema_outdated`，不会把未迁移的实例标记为 ready。随后在本机仓库执行完整 smoke check：

```bash
npm run verify:backend -- https://your-service.up.railway.app
```

成功输出：

```json
{"health":200,"register":201,"create":201,"list":200,"delete":204}
```

这表示 Railway 网络、PostgreSQL、migration、匿名认证和 CRUD 全链路可用。脚本会删除自己创建的旅行册，但保留匿名 smoke device；不会打印 access token，也不会上传照片或本地路径。

## App 接入生产后端

在 native App 的构建环境设置公开地址：

```env
EXPO_PUBLIC_API_ORIGIN=https://your-service.up.railway.app
```

然后重新构建 App。该值会进入客户端 bundle，因此只能是公开 HTTPS origin；它不应出现在 Railway 后端 Service。打开 App 的“设置 → 后端实验”，点击“检查后端连接”，显示“后端连接正常”即完成客户端接入验证。

## Alpha staging（历史）

内部 Alpha 曾要求独立 Railway Service、PostgreSQL 数据库与私有 R2 bucket，不能复用生产数据库、bucket、peppers 或管理员名单；当时使用受邀测试邮箱的非空 allowlist。该段只保留为历史证据，不是当前 external-beta 的操作指令。当前同一个隔离 staging Service 的登录配置以紧接的 External Beta staging 段为准。EAS `alpha` profile 仍只注入 `https://api-staging.onetapreality.com`。

staging 域还必须部署同一 iOS 发布标识对应的 `/.well-known/apple-app-site-association`；当前不部署 Android `assetlinks.json`。P0 时将 `GIFT_SHARING_ENABLED` 设为 `false`，停止发卡和新邀请，停用受影响礼品；恢复前先在 staging 完成回归。

## External Beta staging

外部 Beta 复用同一个隔离 staging Service；取得单独云端配置批准后，确认以下配置状态：

```env
ALPHA_ALLOWED_EMAILS=
GIFT_URL_ORIGIN=https://staging.onetapreality.com
RELEASE_AUDIENCE=external-beta
APPLE_REVIEW_ACCESS_ENABLED=true
APPLE_REVIEW_EMAIL=<受保护变量>
APPLE_REVIEW_CODE=<受保护变量>
APPLE_REVIEW_FIXTURE_SECRET=<43 位 base64url 受保护变量>
APPLE_REVIEW_CLAIM_TOKEN=<43 位 base64url 受保护变量>
```

`ALPHA_ALLOWED_EMAILS` 必须未设置或为空，表示任意格式有效邮箱可以请求验证码；`GIFT_ADMIN_EMAILS` 保持独立，不得因开放登录而扩大开发者、NFC 初始化或管理员权限。若未来需要恢复受限环境，必须使用单独批准的环境与新决策，不得在仍服务外部 Beta 的同一 staging API 上恢复四人白名单。

紧急事件先设置 `GIFT_SHARING_ENABLED=false`。仍服务 external Beta 的同一 staging 不得直接恢复四人名单；只有先暂停 external Beta，或迁移到另一个单独批准的受限环境并记录新决策后，才允许配置非空 `ALPHA_ALLOWED_EMAILS`。

`APPLE_REVIEW_EMAIL`、`APPLE_REVIEW_CODE`、`APPLE_REVIEW_FIXTURE_SECRET` 和 `APPLE_REVIEW_CLAIM_TOKEN` 只存 Railway staging Secret 与 App Store Connect Review Notes，不得读取或复制到 Git、聊天、Issue、命令参数、截图或日志。production 的审核开关必须未设置或明确为 `APPLE_REVIEW_ACCESS_ENABLED=false`，并保持其他 `APPLE_REVIEW_*` 凭据未配置。

配置重部署且 health 验收达到 `schemaVersion>=14` 后，按 [外部 Beta 放行清单](../release/EXTERNAL-BETA-1.1.2.md) 完成审核登录 smoke 与账号删除挑战 smoke；未完成时不得构建或上传外测候选。

## 常见失败

- 构建在 `npm ci` 时以 `EUSAGE` 失败：`package.json` 与 `package-lock.json` 不同步；同步 lockfile 后从干净状态重新运行 `npm ci`。
- `/api/health` 返回 `503 database_unavailable`：检查 API Service 的 `DATABASE_URL` 是否为 PostgreSQL 引用变量，以及 PostgreSQL Service 是否在线。
- 日志提示 relation 不存在：检查 pre-deploy 是否执行 `npm run db:migrate`，不要手工修改已应用 migration。
- 构建成功但健康检查超时：不要固定 `PORT`；服务必须使用 Railway 注入值。
- App 显示网络不可用：确认构建时 `EXPO_PUBLIC_API_ORIGIN` 是完整 HTTPS origin、没有尾部路径，并重新构建 App。

## 礼品维护

不再创建或运行独立 Railway Cron Service。现有 API Service 继续提供仅 POST、受 `GIFT_CARD_CLEANUP_SECRET` 保护的 `/api/internal/gift-maintenance`；一个没有 R2、KV、D1、队列或日志存储绑定的 Cloudflare Workers Free Cron 每小时调用一次。成功的礼品写请求只在上次完成维护超过 90 分钟时触发小批量兜底，健康检查始终只读。

Worker 的本地 dry-run、生产审批、备份、迁移与回滚步骤见 [礼品维护运行手册](../operations/GIFT-MAINTENANCE.md)。创建 Worker、写入 Secret、启用 Cron、调用生产维护端点和部署 Railway 必须分别批准；任何要求付费计划、云端备份或新增 Railway Service 的步骤都应立即停止。
