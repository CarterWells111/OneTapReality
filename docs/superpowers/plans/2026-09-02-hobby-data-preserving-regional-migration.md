# Railway Hobby 数据保持区域迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不升级 Railway Pro、不中断既有数据可恢复性的前提下，将生产 API 与 PostgreSQL 从 US West 迁至香港优先区域，并为中国大陆访问建立可验证的入口。

**Architecture:** Cloudflare 保持官网、R2 bucket 和自定义域名的唯一入口。生产数据通过一次受保护的 `pg_dump` 自定义格式逻辑备份恢复到候选 PostgreSQL；目标在写冻结状态验证完成后才绑定 API 域名。所有 post-cutover 写入由目标库承接，回滚也必须从目标库最新逻辑备份恢复，禁止直指旧数据库。

**Tech Stack:** Railway Hobby、PostgreSQL `pg_dump` / `pg_restore`、Cloudflare DNS/Redirect Rules/R2、Express `API_WRITE_FREEZE`、Node `verify:migration` 和 `verify:public-site`。

---

### Task 1: 合并迁移安全门禁

**Files:**
- Modify: `server.cjs`
- Modify: `src/server/http/api-write-freeze.cjs`
- Modify: `src/app/api/health+api.ts`
- Test: `__tests__/api-write-freeze.test.ts`

- [ ] **Step 1: 复核 PR #87 的完整门禁结果**

Run: `npm run lint && npm run typecheck && npm run test:ci && npm run build:server`

Expected: exit code `0`; `API_WRITE_FREEZE=false` 是默认生产行为，启用时写请求为 `503 maintenance_in_progress`，health 保持 `200`。

- [ ] **Step 2: 审查并合并 PR #87 到 `main`**

GitHub PR: `CarterWells111/OneTapReality#87`

Expected: 仅包含写冻结、迁移校验、运行手册和 `www` 验证；合并后 Railway 生产部署完成且 health 仍返回 `200`。

- [ ] **Step 3: 核查默认生产行为**

Run: `curl.exe -sS --max-time 20 https://api.onetapreality.com/api/health`

Expected JSON includes `database: "ok"`, `schemaVersion: 14`, and `writeFreeze: false` after deployment.

### Task 2: 创建候选区域，不绑定公网域名

**Files:**
- Modify: `docs/operations/DEPLOYMENT-LOG.md`
- Modify: `docs/operations/PRODUCTION-REGIONAL-MIGRATION.md`

- [ ] **Step 1: 在 Railway 创建香港候选环境的 PostgreSQL 和 API 服务**

Use the same GitHub repository and Railway deployment configuration as `TapProdServer`; choose Hong Kong when the region selector provides it, otherwise stop and record Singapore as the only allowed fallback. Do not assign `api.onetapreality.com`, do not create a public domain, and keep `API_WRITE_FREEZE=true` before the first boot.

Expected: candidate API and PostgreSQL are online but have no public custom domain and cannot accept writes.

Record the Railway-provided hostname for the newly created candidate service only in the protected release record, then set `MIGRATION_CANDIDATE_ORIGIN` in the current shell to that service's HTTPS origin; do not place it in application source, EAS configuration, or client builds.

- [ ] **Step 2: 建立安全变量清单，不读取旧值**

In Railway UI, verify that the candidate has a PostgreSQL `DATABASE_URL` reference plus names `DEVICE_TOKEN_PEPPER`, `GIFT_TOKEN_PEPPER`, `GIFT_AUTH_PEPPER`, `GIFT_CARD_CLEANUP_SECRET`, `GIFT_URL_ORIGIN`, `R2_*`, `RUN_DB_MIGRATIONS`, `GIFT_SHARING_ENABLED`, and `API_WRITE_FREEZE`.

Expected: release owner manually copies only continuity-required secret values in Railway UI; no secret values are opened, copied to chat, or written into files.

### Task 3: 做一次无 Pro 的只读恢复演练

**Files:**
- Modify: `docs/operations/DEPLOYMENT-LOG.md`
- Use: `scripts/verify-migration.cjs`

- [ ] **Step 1: 准备受保护的本机备份位置和短期环境变量**

The release owner creates a non-synced, encrypted local directory and sets `MIGRATION_BACKUP_PATH`, `MIGRATION_SOURCE_DATABASE_URL`, and `MIGRATION_TARGET_DATABASE_URL` only in their current local process. Do not echo any value.

Expected: `pg_dump --version` succeeds and the backup destination is not inside the repository, desktop sync folders, or shared storage.

- [ ] **Step 2: 导出并验证逻辑备份**

Run:

```powershell
pg_dump --format=custom --no-owner --no-acl --file "$env:MIGRATION_BACKUP_PATH" "$env:MIGRATION_SOURCE_DATABASE_URL"
pg_restore --list "$env:MIGRATION_BACKUP_PATH"
```

Expected: both commands exit `0`; the listing is inspected only locally and is not pasted into tickets or chat.

- [ ] **Step 3: 恢复候选库并运行完整性校验**

Run:

```powershell
pg_restore --exit-on-error --no-owner --dbname "$env:MIGRATION_TARGET_DATABASE_URL" "$env:MIGRATION_BACKUP_PATH"
npm run verify:migration
```

Expected: `pg_restore` exits `0`; `verify:migration` exits `0` and reports no count, primary-key, missing-table, or orphan-reference failures.

- [ ] **Step 4: 验证候选 API 的只读能力**

Run: `curl.exe -sS --max-time 20 "$env:MIGRATION_CANDIDATE_ORIGIN/api/health"`

Expected: health returns `200`, `database: "ok"`, `schemaVersion: 14`, `writeFreeze: true`; no login, gift publish, device registration, or maintenance request is performed.

### Task 4: 最终冻结、导出和切换

**Files:**
- Use: `docs/operations/PRODUCTION-REGIONAL-MIGRATION.md`
- Use: `scripts/verify-migration.cjs`

- [ ] **Step 1: 打开旧 API 写冻结并验证**

Set only `API_WRITE_FREEZE=true` for `TapProdServer` in Railway, deploy, wait 10 minutes for in-flight work and maintenance lease, then check `/api/health`.

Expected: health is `200` with `writeFreeze: true`; state-changing API requests return `503 maintenance_in_progress`; no database data is changed manually.

- [ ] **Step 2: 生成最终逻辑备份并恢复目标库**

Run the exact Task 3 backup, list, restore, and `npm run verify:migration` commands with fresh backup filename and the frozen source URL.

Expected: all commands exit `0`; release log records only timestamps, command exit codes, logical table counts, and pass/fail status.

- [ ] **Step 3: 切换 API 域名并做只读验证**

Move `api.onetapreality.com` from the old Railway service to the candidate service only after candidate health reports frozen/ready. Verify `/api/health`, existing gift landing pages, existing signed media, iOS Universal Links, and China mobile/telecom/unicom read-only access for 30 minutes.

Expected: custom domain has one active target; no write is enabled until all read-only checks pass.

- [ ] **Step 4: 解除目标写冻结并验证最小写路径**

Set candidate `API_WRITE_FREEZE=false`, deploy, then validate one authorized login/write lifecycle and scheduled maintenance without recording tokens or user data.

Expected: health returns `writeFreeze: false`; new writes are present only on the target database.

### Task 5: 观察和数据保持回滚

**Files:**
- Modify: `docs/operations/DEPLOYMENT-LOG.md`
- Use: `docs/operations/PRODUCTION-REGIONAL-MIGRATION.md`

- [ ] **Step 1: 保留旧环境且不接收流量**

Keep the old API/database online and read-only for at least 7 days; do not delete its service, volume, R2 bucket, or object keys.

Expected: daily health and three-city/three-carrier observations are recorded without user data.

- [ ] **Step 2: 只允许同步式回滚**

If rollback is required after target writes begin, enable the target write freeze, create a fresh target logical backup, restore that backup to the rollback database, run `npm run verify:migration`, then switch the API custom domain.

Expected: no direct DNS rollback to stale source data is performed.

- [ ] **Step 3: 在第七天完成演练与退役决定**

Repeat backup/list/restore/verify plus iOS login, existing gift, existing album, and media-read checks. Request a separate approval before deleting old services or revoking old R2 credentials.

Expected: old environment is retained if any verification fails; retirement occurs only after all checks pass and separate approval is recorded.
