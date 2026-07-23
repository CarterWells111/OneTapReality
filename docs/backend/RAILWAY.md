# Railway 部署

Railway 仅托管 Expo API Routes 的 Node server；现有 App 仍以本地 SQLite 为业务数据源，不会因为部署而自动同步。

## 仓库配置

- `railway.json`：build、migration、start 与 healthcheck。
- `npm run build:server`：执行 API-only Expo server export。
- `npm run start:server`：加载运行时环境变量并启动 Express adapter。
- `/api/health`：Railway 部署健康检查路径。
- Node.js：`>=20.16.0`，与 `expo-server` 要求一致。

## Railway 服务变量

在 Railway Service → Variables 配置：

```env
NODE_ENV=production
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-server-only-token
DEVICE_TOKEN_PEPPER=generate-a-long-random-secret
```

不要手动设置 `PORT`，Railway 会注入。不要在 Railway 后端设置 `EXPO_PUBLIC_API_ORIGIN`；该值应在 App 构建环境中设置为部署后的公开域名。

## 部署步骤

1. 将当前分支提交并推送到 GitHub。
2. 在 Railway 创建项目，选择 Deploy from GitHub repo。
3. 添加上面的服务变量。
4. Railway 会读取 `railway.json`：构建 API bundle，执行 `npm run db:migrate`，再运行 `npm run start:server`。
5. 在 Service → Settings → Networking 生成公开域名。
6. 确认 Deployments 中 `/api/health` 健康检查通过。
7. 本地执行：

   ```bash
   npm run verify:backend -- https://your-service.up.railway.app
   ```

8. 在 native App 的构建环境设置：

   ```env
   EXPO_PUBLIC_API_ORIGIN=https://your-service.up.railway.app
   ```

9. 重新构建 App；公开 origin 是构建时配置，修改后仅重启已发布 App 不会生效。

## 成功标准

验证脚本输出以下状态即表示 Railway、Turso、migration、认证与 CRUD 全链路可用：

```json
{"health":200,"register":201,"create":201,"list":200,"delete":204}
```

脚本会删除自己创建的旅行册，但会保留匿名 smoke device 记录。它不会打印 access token，也不会上传照片或本地路径。
