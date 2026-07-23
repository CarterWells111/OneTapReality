# Expo API Routes 后端接口骨架设计

## 目标

为 OneTapReality 增加可测试的服务端接口边界，同时保持现有 app 的本地 SQLite 主数据源和离线行为。

## 架构

API Routes 位于 `src/app/api/`，只调用 `src/server/` 中的 server-only 模块。Turso/libSQL 由 Drizzle 访问；客户端通过 `src/services/backend/` 使用 fetch 和 SecureStore。server-only 模块不得被 React 页面导入。

## 数据与隐私

服务端保存匿名设备、脱敏旅行册和脱敏页面。照片数量可以上传，照片 URI、图片二进制、精确位置、账号信息和秘密不能上传。客户端不自动同步、不双写。

## 验收

- 未携带或伪造 token 不能读取其他设备数据。
- 旅行册 CRUD、设备隔离和页面级联删除有自动化测试。
- 从空 libSQL 数据库应用全部 Drizzle migration 成功。
- `npm run lint`、`npm run typecheck`、`npm run test:ci` 和 `npx expo-doctor` 通过。
