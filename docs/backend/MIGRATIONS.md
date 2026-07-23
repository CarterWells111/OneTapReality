# 服务端 Migration 规范

## 技术边界

服务端使用 Turso/libSQL 与 Drizzle ORM。`src/server/db/schema.ts` 是 schema 的代码源，`drizzle/` 保存生成后的 SQL 与 Drizzle meta/journal 文件。

## 命名与执行

- 首个文件为 `drizzle/0000_initial.sql`。
- 后续文件使用 `0001_<verb>_<noun>.sql`，例如 `0001_add_memory_version.sql`。
- 只提交由 `drizzle-kit generate` 生成的 migration；禁止手写绕过 schema 的生产变更。
- 使用 `drizzle-kit migrate` 按顺序应用 migration；API 请求不执行 migration。
- 已应用 migration 不允许修改，不提供 down migration；需要修复时新增 forward migration。
- 所有变更必须通过空 libSQL 数据库从头应用的测试。

## Schema 规则

- 表名和列名使用 snake_case。
- ID 使用文本 UUID；时间使用 UTC ISO-8601 文本。
- 外键明确声明 `ON DELETE CASCADE` 或保留策略。
- JSON 字段写入前必须通过 Zod 校验，禁止保存照片 URI、token 或秘密。
- 设备查询使用 `device_id` 索引；页面查询使用 `(memory_id, position)` 索引。
- 本地 `luyi.db` 的 migration 继续由 `src/storage/memory-repository.ts` 管理，本规范不改变本地 schema。

## 环境变量

服务端只读取：

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `DEVICE_TOKEN_PEPPER`

这些变量不得以 `EXPO_PUBLIC_` 开头，也不得进入客户端可导入模块。
