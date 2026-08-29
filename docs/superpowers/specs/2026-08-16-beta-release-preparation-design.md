# Beta 发布准备设计

## 目标

在不接触当前脏工作树、不触发云端构建的前提下，从最新远端 `main` 整理一个可审查的 Beta 发布准备分支，消除数据库迁移编号歧义，并确认 staging 的最后两个准入变量。

## 分支与范围

- `codex/beta-release-prep` 只包含已验证的 staging 脱敏证据、发布治理测试和后续 P0/P1 修复。
- 当前未提交的相册封面功能留在原工作树，不复制到 Beta 候选。
- `codex/database-maintenance-hardening` 继续作为独立数据库第二阶段候选，不并入 Beta 分支。

## 数据库迁移顺序

数据库第二阶段先发布并保留 `0008_database_phase2`。相册封面功能必须在包含该迁移的最新基线上重新生成 `0009_shared_album_covers`、journal 和 snapshot。Beta 分支本身不携带这两个迁移，因此当前仍以 schema 7 运行。

## staging 配置核对

staging 变量只读核对只检查变量名称及以下非秘密值，不读取或输出任何 secret：

- `GIFT_SHARING_ENABLED=true`
- `GIFT_URL_ORIGIN=https://staging.onetapreality.com`

若值缺失或错误，只记录阻断项。Railway 写入必须单独批准，写入后再按运维 Issue 的回滚与验证步骤复核。

## 安全与费用

本地安装、测试、Git 历史整理和只读核对不触发云端构建。不得运行 EAS build、Railway deploy、migration、维护 POST 或任何生产写入；不得新增服务、监控、存储或付费绑定。

## 验收

- 工作树基于执行时最新 `origin/main`，且不含原工作树未提交功能。
- staging 证据提交可独立审查。
- 发布决策明确 `0008_database_phase2` 后接 `0009_shared_album_covers`。
- 干净安装、数据库检查、lint、typecheck、test:ci 与 build:server 全部通过。
- 所有远端写入继续分别审批。
