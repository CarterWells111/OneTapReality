# 通用本地开发与 Railway 后端部署设计

## 目标

让 Expo Router API Routes 在开发期保持单进程启动，同时提供可在 Railway 运行的生产 Node server，并让 Web、Expo Go 与生产 native 共用同一套 API client 和接口契约。

## 运行模型

- 开发：`npm run dev` 启动 Expo dev server，客户端和 `/api/*` 共用一个 origin。Expo Router 在开发期自动处理 native 相对请求。
- 生产构建：`npm run build:server` 使用 `--no-ssg` 执行 API-only Expo Web server export，生成最小 `dist/client` 与 API 路由所在的 `dist/server`。
- 生产运行：`npm run start:server` 启动 Express；导出物由 Express 提供，请求交给 `expo-server/adapter/express`。
- Railway：Railpack 执行构建；pre-deploy 执行 Drizzle migration；服务监听 `0.0.0.0:$PORT`；`/api/health` 返回 200 后才接收流量。

## API origin

请求 URL 的规则只有两层：

1. `EXPO_PUBLIC_API_ORIGIN` 存在时，使用规范化后的绝对 origin。
2. 未配置时，保留 `/api/*` 相对 URL，由 Expo Router 开发运行时或 Web 当前 origin 解析。

动态 Expo config 将同一个 `EXPO_PUBLIC_API_ORIGIN` 写入 Expo Router plugin 的 `origin`，从而让生产 native 的原生 `fetch` 与自定义 API client 指向同一 Railway 域名。该变量是公开地址，不包含秘密；Turso token 和 device pepper 仍只在 Railway 运行环境中配置。

## Railway 适配

根目录新增 `server.cjs`，仅负责压缩、导出文件和 Expo request handler，不复制任何业务路由。Railway 使用 API-only export，因此不要求当前本地 SQLite App 同时支持 Web；`railway.json` 固定 build、pre-deploy、start 和 healthcheck 命令。Railway 变量为 `TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN`、`DEVICE_TOKEN_PEPPER` 和 `NODE_ENV=production`；`PORT` 由 Railway 注入。

## 验证

跨平台 `npm run verify:backend -- <origin>` 执行 health、设备注册、旅行册创建、列表检查和清理删除，且不打印 access token。自动测试覆盖 origin 规范化、Expo config 注入、smoke check 成功与错误状态。最终以本地生产 export + server + smoke check 验证 Railway 同构路径。

## 非目标

本阶段不实际创建 Railway 项目、不推送部署、不配置真实 Turso 凭据、不启用自动同步，也不将 Express 发展为独立业务框架。
