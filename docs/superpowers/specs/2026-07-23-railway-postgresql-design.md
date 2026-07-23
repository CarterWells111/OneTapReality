# Railway PostgreSQL Backend Design

## Goal

将 Expo API Routes 后端从尚未部署的 Turso/libSQL baseline 切换为 Railway PostgreSQL，使 API Service 和数据库位于同一 Railway Project，并通过 Railway 私有引用变量连接。客户端 API 契约、本地 SQLite 主数据源和手动后端实验入口保持不变。

## Scope

本次修改服务端数据库 schema、驱动、migration、测试数据库、环境变量和部署文档。继续支持匿名设备注册、health、capabilities 与旅行册 CRUD；继续禁止自动同步、照片上传、本地路径上传、账号、支付、分析、真实 AI、真实 NFC 和 CI 配置。

本地 App 的 `expo-sqlite`、`luyi.db`、本地 migration 和本地业务仓储不属于本次迁移范围。

## Architecture

生产 API 使用 `pg.Pool` 与 `drizzle-orm/node-postgres`。连接字符串只从服务端 `DATABASE_URL` 读取；Railway API Service 将其配置为 `${{Postgres.DATABASE_URL}}`，从而使用项目私有网络。代码不硬编码数据库主机、端口、用户、密码或 SSL 参数，也不记录连接字符串。

测试使用 `pg-mem` 创建每测试独立的内存 PostgreSQL，并通过兼容的 `pg` Pool adapter 接入同一个 Drizzle node-postgres database type。自动测试不访问 Railway，不需要 Docker。本地手动启动 API 时必须提供一个 PostgreSQL `DATABASE_URL`；可以使用本机 PostgreSQL，或在明确接受公网数据库出口流量时使用 Railway 的公开连接 URL。

## Schema

`src/server/db/schema.ts` 改用 `pgTable`：

- `devices`：文本 ID、唯一 installation ID、token hash、UTC ISO 创建/最近访问/撤销时间。
- `memories`：文本 ID、设备外键、标题、城市、日期、状态、照片数量与 UTC ISO 时间；设备删除时级联删除。
- `memory_pages`：文本 ID、旅行册外键、位置、类型、标题、正文、照片槽位和 `jsonb` 脱敏布局；旅行册删除时级联删除。

表名、列名和索引名继续使用 snake_case。API DTO 继续输出 ISO 字符串，不引入 PostgreSQL enum 或数据库生成 UUID，以避免改变现有 API 行为。页面布局在写入前继续由 Zod 校验，数据库中不保存照片 URI、图片二进制、token 明文或本地路径。

## Repository Behavior

现有 repository 函数签名和设备隔离条件保持不变。事务继续覆盖旅行册和页面的组合写入。删除旅行册时使用 PostgreSQL `RETURNING` 判断匹配行是否存在，并依赖 `ON DELETE CASCADE` 删除页面，不再读取 libSQL 的 `rowsAffected`。

health route 使用 Drizzle `execute(sql\`select 1\`)`。数据库连接或查询失败时返回现有 `503 database_unavailable` 错误；其他 API 继续使用统一 `{ error: { code, message, fields? } }` 格式。缺少 `DATABASE_URL` 时抛出明确的服务端配置错误，且不回显变量值。

## Migrations

Turso 从未创建且不存在云端数据，因此本次是部署前 dialect replacement，而不是数据迁移：

- 将 `drizzle.config.ts` 改为 `dialect: "postgresql"`，连接变量为 `DATABASE_URL`。
- 删除旧 libSQL migration/meta，并由 PostgreSQL schema 重新生成 `drizzle/0000_initial.sql` 和 meta。
- 从新 baseline 开始，后续文件继续按 `0001_<verb>_<noun>.sql` 递增；已部署 migration 不允许修改，不提供 down migration。
- Railway 继续在 pre-deploy 阶段运行 `npm run db:migrate`；非零退出会阻止新版本启动。
- migration 测试从空 pg-mem 数据库应用全部 SQL，再验证三张表、索引、外键和级联删除。

旧 libSQL baseline 保留在 Git 历史中，不新增 archive 目录，也不导入 `.data/backend.db`。

## Dependencies and Configuration

删除 `@libsql/client`。添加运行时依赖 `pg`，开发依赖 `@types/pg` 与 `pg-mem`；保留 Drizzle ORM 和 Drizzle Kit。

服务端环境变量变为：

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/onetapreality
DEVICE_TOKEN_PEPPER=replace-with-a-local-only-secret
NODE_ENV=development
```

Railway 不设置 `PORT`，由平台自动注入。`EXPO_PUBLIC_API_ORIGIN` 仍只用于 native App 构建，不能放数据库凭据。Turso URL/token 从代码、环境示例和部署文档中全部移除。

## Railway Deployment

Railway Project 包含两个 Service：GitHub 源码 API Service 和 PostgreSQL Service。API Service Variables 使用：

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
DEVICE_TOKEN_PEPPER=<random-server-secret>
NODE_ENV=production
```

现有 `railway.json` 继续定义 `npm run build:server`、`npm run db:migrate`、`npm run start:server` 和 `/api/health`。首次部署顺序为：PostgreSQL ready、API build、pre-deploy migration、API start、healthcheck、生成公开域名、运行 `npm run verify:backend -- <origin>`。

## Testing

测试先行覆盖：

1. 数据库客户端只接受 `DATABASE_URL`，缺失时失败，且不再读取 Turso 变量。
2. PostgreSQL migration 可从空数据库应用到最新版本。
3. 设备注册、token rotation、token hash 查询和 last-seen 更新正常。
4. 旅行册 CRUD 按设备隔离，更新事务替换页面，硬删除触发页面级联删除。
5. health route 使用 PostgreSQL execute 并在数据库不可用时返回 503。
6. 客户端 contracts、SecureStore、手动连接页面和部署 smoke verifier 保持通过。

完成前运行：

```bash
npm ci
npm run lint
npm run typecheck
npm run test:ci
npm run db:check
npm run build:server
npx expo-doctor
```

不连接真实 Railway PostgreSQL 做自动测试；真实部署后使用现有 smoke verifier 验证 health、注册、创建、列表和删除全链路。

## Security and App Store Boundary

PostgreSQL 密码只存在于 Railway 变量引用中，不进入 Git、Expo public 环境变量、客户端 bundle 或日志。API 继续只保存脱敏旅行册 DTO 和 peppered token hash。切换数据库供应方式不扩大 App 收集的数据类型；公开上架前仍需显式云端同意、云端数据删除能力、准确隐私政策和 App Store Connect 数据申报。
