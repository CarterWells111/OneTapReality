# NFC 礼品数据库维护运行手册

## 零新增费用边界

维护架构只有现有 Railway API/PostgreSQL、现有私有 R2，以及一个 Workers Free 小时级 Cron。Worker 每小时只发送一次 POST，不保存数据、不内部重试，且不绑定 R2、KV、D1、Durable Objects、Queues 或付费可观测性。仓库内 `wrangler.toml` 关闭持久化观测；约 744 次/月的触发量远低于 Workers Free 的每日请求限额。

以下任一步骤如果要求启用 Workers Paid、Railway 新服务、付费快照、云备份对象、队列、监控或其他新计费项目，立即停止。不得为了执行本手册把生产 secret 写入仓库、Issue、PR、终端输出或日志。

## 本地验收

这些命令只构建和测试本地文件，不登录 Cloudflare，也不创建远端资源：

```bash
npm ci
npm run db:check
npm run lint
npm run typecheck
npm run test:ci
npm run build:server
npm run worker:check
```

`worker:check` 固定使用 Wrangler dry-run。实际 `wrangler deploy` 不属于本地验收，未经单独批准不得执行。

## 第一阶段迁移与部署

以下审批必须分别批准，不得用一次批准覆盖后续步骤：

1. 批准生产 PostgreSQL 只读检查，以及在本机执行 `pg_dump`。备份文件必须位于仓库外且不得上传云端。
2. 将备份恢复到本地临时 PostgreSQL，完成本地恢复验证：迁移前后核对关键表行数，运行 `npm run db:check` 对应的 schema 检查，并验证真实事务行锁与 `FOR UPDATE SKIP LOCKED`。恢复失败不得迁移生产。
3. 单独批准应用第一阶段增量 migration；再单独批准部署 Railway API。部署前确认最新 `main` 是候选提交的祖先。
4. 部署后只读检查 `/api/health`：必须返回 `database: "ok"` 和满足最低要求的 `schemaVersion`。生产 smoke 或任何写入验证需要另行批准。

备份与恢复使用管理员本机已安装的 PostgreSQL 客户端；实际连接串只通过临时环境变量传入，不写入命令或文档。参考流程如下，数据库名称和本地连接串必须在执行前明确确认：

```text
pg_dump --format=custom --no-owner --no-acl --file=<仓库外备份路径> <生产只读连接>
createdb <本地临时恢复库>
pg_restore --exit-on-error --no-owner --dbname=<本地临时恢复库> <仓库外备份路径>
```

生产迁移不依赖自动云备份。备份文件的保留与删除由发布负责人手动决定；未经明确指示不得由脚本自动删除。

## Cloudflare Worker 启用

代码与 `workers/gift-maintenance/wrangler.toml` 只定义一个 UTC 每小时触发器。正式启用按以下顺序分别批准：

1. 确认 Cloudflare 账户仍为 Workers Free，配置中不存在付费绑定或新计费承诺。
2. 批准创建/部署 Worker；实际部署命令不得由 CI 自动运行。
3. 批准写入 Secret `MAINTENANCE_SECRET`，其值与 Railway 的 `GIFT_CARD_CLEANUP_SECRET` 一致。
4. 批准启用配置中的单个 Cron Trigger。
5. 批准首次调用会修改生产数据的维护端点，并只记录脱敏计数和 HTTP 状态。

`MAINTENANCE_ENDPOINT` 是公开 HTTPS 地址，可保存在配置中；`MAINTENANCE_SECRET` 只能通过 Cloudflare Secret 保存。Worker 异常时先停用 Cron，由成功礼品写请求的兜底继续维护，不新增替代服务器。

## 第二阶段完成状态与持续观察

第一阶段自北京时间 2026-08-09 09:00:58 起完成了至少 168 小时的稳定观察。生产只读复核、本地 `pg_dump`、本地恢复验证与第二阶段本地迁移演练均已通过；演练确认 8 项待验证约束可成功验证、两张遗留表为空且可删除，其余 18 张表行数不变，礼品卡审计事件完整保留。

`drizzle/0014_database_phase2.sql` 已完成生产 migration 与 Railway 部署。迁移前的本地 `pg_dump`、恢复验证和关键表行数校验均已通过；迁移以排他锁和空表保护验证两张遗留认证表为空，随后验证 8 项约束，以不带 `CASCADE` 的方式删除 `gift_email_codes` 与 `gift_sessions`。当前生产健康契约为 Schema 14，礼品卡审计事件与其他业务表数据保持完整。

部署后的首次维护已完成：接口返回 HTTP 200，租约已释放、无维护错误且媒体清理队列为空。`0014_database_phase2.sql` 现为不可修改的已应用历史 migration；未来任何 schema、生产 migration、Railway 部署或维护 POST 仍须重新分别批准。

外部 Beta 首月的 staging 日常检查、production 低频健康检查及 P0/P1/P2 响应统一遵循 [`EXTERNAL-BETA-OBSERVATION.md`](EXTERNAL-BETA-OBSERVATION.md)。持续数据库观察至少包括最近维护时间、租约和错误、到期或死信清理任务、账号删除超期、保留期违规及举报通知失败；自动化只能使用只读聚合 SELECT，发现异常只报告，不自行修改数据。

## 回滚

- Worker 异常：禁用 Cron，不删除 Worker Secret 以外的数据，继续依赖请求兜底。
- API 异常：回滚到已确认不调用遗留礼品认证表的兼容代码；第一阶段 schema 保持向后兼容，不回滚增量列和索引。
- 迁移异常：停止部署，使用已验证的本地备份按发布负责人指令恢复。破坏性第二阶段没有经过备份验证与单独批准时不得开始。
