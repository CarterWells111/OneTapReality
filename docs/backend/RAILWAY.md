# Railway 部署

Railway 托管 Expo API Routes 的 Node server 和同项目 PostgreSQL；现有 App 仍以本地 SQLite 为唯一业务数据源，不会因为部署而自动同步。

## 仓库内置配置

- `railway.json`：build、pre-deploy migration、start 与 healthcheck。
- `npm run build:server`：执行 API-only Expo server export。
- `npm run db:migrate`：在发布新版本前应用 Drizzle migration。
- `npm run start:server`：启动 Expo Server 的 Express adapter。
- `/api/health`：Railway 健康检查路径。
- Node.js：`>=20.19.0 <21`。

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
6. 在 API Service 的 **Settings** 确认仓库根目录没有被改到子目录。构建、pre-deploy 和启动命令由 `railway.json` 提供，一般无需手填。
7. 触发部署。日志应依次出现 server export、Drizzle migration 和 server listening；pre-deploy 失败时 API 新版本不会启动。
8. 进入 **Settings → Networking → Generate Domain**，生成公开 HTTPS 域名。

## 部署后验证

先访问：

```text
https://your-service.up.railway.app/api/health
```

应返回 HTTP 200，且 JSON 中包含 `"database":"ok"`。随后在本机仓库执行完整 smoke check：

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

## 常见失败

- `/api/health` 返回 `503 database_unavailable`：检查 API Service 的 `DATABASE_URL` 是否为 PostgreSQL 引用变量，以及 PostgreSQL Service 是否在线。
- 日志提示 relation 不存在：检查 pre-deploy 是否执行 `npm run db:migrate`，不要手工修改已应用 migration。
- 构建成功但健康检查超时：不要固定 `PORT`；服务必须使用 Railway 注入值。
- App 显示网络不可用：确认构建时 `EXPO_PUBLIC_API_ORIGIN` 是完整 HTTPS origin、没有尾部路径，并重新构建 App。
