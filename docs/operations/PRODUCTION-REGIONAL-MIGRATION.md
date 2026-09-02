# 生产区域迁移运行手册

本手册用于将生产 API 与 PostgreSQL 迁至 Railway 香港优先、新加坡备选区域。所有写入操作都需要 production release owner 的单独批准；不得在仓库、终端记录、Issue、日志或聊天中保存数据库 URL、secret、token、邮箱、照片或 R2 object key。

## 本地门禁

```powershell
npm ci
npm run lint
npm run typecheck
npm run test:ci
npm run build:server
```

## 必须分别批准的操作

1. `www` Cloudflare DNS 与同路径 308 redirect。
2. 生产 PostgreSQL 只读备份和候选区域恢复演练。
3. 新 Railway API/PostgreSQL、候选 R2 最小权限 key 与控制台变量录入。
4. 部署 `API_WRITE_FREEZE` 门禁代码。
5. 开启或关闭任一生产 Service 的 `API_WRITE_FREEZE`。
6. 最终备份、Cloudflare API 自定义域名/DNS 切换与 iOS 验证。
7. 7 天观察后的旧环境退役和旧 R2 key 撤销。

## 候选恢复演练

候选 Service 不绑定 `api.onetapreality.com`，不向公众开放，不发验证码，不运行 maintenance。它通过控制台安全录入既有 `DEVICE_TOKEN_PEPPER`、`GIFT_TOKEN_PEPPER`、`GIFT_AUTH_PEPPER`、`GIFT_CARD_CLEANUP_SECRET`、`GIFT_URL_ORIGIN=https://onetapreality.com` 和新建的最小权限 R2 key；这些值不得显示或导出。

发布负责人在仓库外受保护目录中，通过受保护环境变量运行：

```powershell
pg_dump --format=custom --no-owner --no-acl --file "$env:MIGRATION_BACKUP_PATH" "$env:MIGRATION_SOURCE_DATABASE_URL"
pg_restore --list "$env:MIGRATION_BACKUP_PATH"
pg_restore --exit-on-error --no-owner --dbname "$env:MIGRATION_TARGET_DATABASE_URL" "$env:MIGRATION_BACKUP_PATH"
npm run verify:migration
```

验收：`pg_restore --list` 无错误、`verify:migration` 返回 0、候选 `/api/health` 报告 `database: "ok"`。记录逻辑表名、行数、校验时间和状态；不要记录查询输出中的业务数据。

## 最终切换

1. 部署门禁代码但保持美国 API `API_WRITE_FREEZE=false`，验证健康、既有礼品与一次无敏感测试写入。
2. 开启美国 API `API_WRITE_FREEZE=true`，确认 API 写请求返回 `503 maintenance_in_progress`，health 为 200 且 `writeFreeze=true`。
3. 等待至少 10 分钟及既有 maintenance lease 完成；创建最终备份、恢复目标 PostgreSQL 并运行 `npm run verify:migration`。
4. 启动新 API，保持 `API_WRITE_FREEZE=true`，确认既有会话、礼品、受邀相册和签名媒体只读访问。
5. 经批准将 `api.onetapreality.com` 指向新 Service；在北京、上海、广州的移动、电信、联通网络完成 30 分钟只读验证。
6. 通过后关闭新 API 冻结，并验证一次登录、礼品写入、媒体读取和清理。

## 数据保持回滚

新区域接收写入后，禁止直接将 DNS 指回旧 API。先将新 API 的 `API_WRITE_FREEZE=true`，等待在途写入完成，备份新 PostgreSQL，恢复到回滚 PostgreSQL，并运行 `npm run verify:migration`。只有 health、既有数据和校验均通过后，才能重新绑定 `api.onetapreality.com` 并解除回滚目标冻结。R2 bucket 和对象始终保持不变。

## 观察与退役

切换后 24 小时按三地三网轮换验证官网、`www`、AASA 与 API health；第 7 天重复备份恢复演练、迁移校验、iOS 登录、既有礼品、既有相册、媒体读取与一笔无敏感写入。仅在全部通过后，经单独批准退役旧 Service/数据库和撤销旧 R2 key；不得删除生产 R2 bucket 或对象。
