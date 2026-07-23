# 架构

应用使用 Expo Router、TypeScript 和 `expo-sqlite`。路由只放在 `src/app`，业务代码放在 `src/features`、`src/services`、`src/storage` 与 `src/components`。

SQLite 保存纪念册、照片顺序和旅行册页内容。城市解锁由已保存纪念册的城市字段推导，不保存重复状态。

`DraftGenerator` 与 `CityKeyResolver` 是稳定边界：本版分别由本地演示实现和模拟 NFC 实现提供。未来云端实现只能替换服务层，不能改变页面层或将秘密放入客户端。

服务端接口骨架使用 Expo Router API Routes，路由位于 `src/app/api`，server-only 数据库与认证代码位于 `src/server`。Railway PostgreSQL 与 Drizzle 只承载匿名设备和脱敏旅行册 CRUD；现有 app 页面继续使用本地 SQLite，不自动同步、不双写。

开发期由一个 Expo dev server 同时提供客户端和 API Routes，另行连接本机 PostgreSQL。Railway 生产部署使用 `expo export --platform web --no-ssg` 生成 API-only server bundle，再由根目录 `server.cjs` 通过 `expo-server/adapter/express` 托管；Express 不拥有业务路由。服务端通过 `pg.Pool` 与 Drizzle node-postgres driver 读取唯一的 `DATABASE_URL`，测试则使用 pg-compatible 内存适配器。

API 请求默认保持相对路径。生产 native 构建通过 `EXPO_PUBLIC_API_ORIGIN` 注入 Railway HTTPS 域名，`app.config.ts` 同步设置 Expo Router `origin`，避免客户端和 Router 使用不同后端。

