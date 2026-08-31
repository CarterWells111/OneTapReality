# Staging Open Email Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the isolated external-Beta staging API to one-time-code login from every valid email address without widening developer or gift authorization, and remove obsolete Alpha-allowlist operations from current tooling and runbooks.

**Architecture:** The authentication implementation already treats an absent or empty `ALPHA_ALLOWED_EMAILS` as open access, so no runtime auth code or App rebuild is required. Repository changes retire the NFC Lab's allowlist rollback step and make current governance documents describe the open-email staging policy; the only live change removes `ALPHA_ALLOWED_EMAILS` from the Railway staging API service, followed by redacted health and controlled-account verification.

**Tech Stack:** TypeScript/Jest governance tests, Node.js CommonJS staging utilities, Markdown operations documentation, Railway staging, Expo API Routes, Resend email OTP.

---

## File structure

- `__tests__/nfc-staging-test.test.ts`: proves the helper surface no longer includes an allowlist rollback operation.
- `__tests__/nfc-staging-cli.test.ts`: proves the NFC cleanup runner no longer asks operators to remove temporary email aliases.
- `scripts/nfc-staging-test-helpers.cjs`: removes the obsolete `verifyAllowlistRollback` network operation.
- `scripts/nfc-staging-test.cjs`: removes the obsolete cleanup pause and preserves resource cleanup plus the local PR guard.
- `__tests__/external-beta-docs.test.ts`: locks the active open-email policy across current release and operations documents.
- `.env.example`: records that external-Beta staging and production leave `ALPHA_ALLOWED_EMAILS` empty.
- `docs/DECISIONS.md`: explicitly marks the new decision as superseding earlier Alpha allowlist rules while preserving them as history.
- `docs/EXECUTION-CHECKLIST.md`: changes the active staging login gate from four-person allowlist to open valid-email login.
- `docs/SECURITY.md`: separates login eligibility from administrator and gift authorization.
- `docs/backend/RAILWAY.md`: gives the exact current staging variable policy and future restricted-environment boundary.
- `docs/operations/ALPHA-STAGING.md`: marks the allowlist procedure as completed Alpha history, not the current external-Beta setting.
- `docs/operations/NFC-STAGING-LAB.md`: removes alias add/remove instructions and the destructive login-code rollback probe.
- `docs/operations/REHEARSAL-RECORD.md`: preserves the 2026-08-06 evidence as historical and records that it has been superseded.
- `docs/operations/DEPLOYMENT-LOG.md`: records the approved staging variable change, redacted evidence, and rollback.
- `docs/release/EXTERNAL-BETA-1.1.2.md`: makes an empty `ALPHA_ALLOWED_EMAILS` an external-Beta staging requirement.
- `docs/release/QA-CHECKLIST.md`: verifies open login, non-admin status, and unrelated-gift denial instead of allowlist rejection.

### Task 1: Retire the NFC Lab allowlist rollback operation

**Files:**
- Modify: `__tests__/nfc-staging-test.test.ts`
- Modify: `__tests__/nfc-staging-cli.test.ts`
- Modify: `scripts/nfc-staging-test-helpers.cjs`
- Modify: `scripts/nfc-staging-test.cjs`

- [ ] **Step 1: Replace the obsolete helper test with a failing surface-contract test**

Remove `verifyAllowlistRollback` from the `loadHelpers` return type in `__tests__/nfc-staging-test.test.ts`. Replace the test named `confirms all temporary aliases are rejected before local PR artifacts are removed` with:

```ts
it("does not treat open staging accounts as temporary allowlist entries", () => {
  const helpers = loadHelpers()!;

  expect(helpers).not.toHaveProperty("verifyAllowlistRollback");
});
```

Add this assertion to `registers commands and precisely ignores the generated route` in `__tests__/nfc-staging-cli.test.ts`:

```ts
const runner = require("node:fs").readFileSync(cliPath, "utf8");
expect(runner).not.toContain("verifyAllowlistRollback");
expect(runner).not.toContain("Remove the three +nfc aliases");
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm.cmd exec -- jest --runInBand --runTestsByPath __tests__/nfc-staging-test.test.ts __tests__/nfc-staging-cli.test.ts
```

Expected: FAIL because `scripts/nfc-staging-test-helpers.cjs` still exports `verifyAllowlistRollback` and `scripts/nfc-staging-test.cjs` still imports and calls it.

- [ ] **Step 3: Remove the obsolete helper and cleanup pause**

Delete this entire function from `scripts/nfc-staging-test-helpers.cjs`:

```js
async function verifyAllowlistRollback({ apiOrigin, emails, request = fetch }) {
  if (apiOrigin !== STAGING_API_ORIGIN) throw new Error("Allowlist rollback can only be checked against staging");
  for (const email of emails) {
    const response = await request(`${apiOrigin}/api/auth/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    let payload = null;
    try { payload = await response.json(); } catch { /* invalid responses fail below */ }
    if (response.status !== 403 || payload?.error?.code !== "beta_invite_required") {
      throw new Error("Temporary NFC test email is still present in the staging allowlist");
    }
  }
}
```

Remove `verifyAllowlistRollback` from the helper module export and from the destructured import in `scripts/nfc-staging-test.cjs`. In `preparePrCommand`, replace:

```js
await prompt("Remove the three +nfc aliases from staging ALPHA_ALLOWED_EMAILS, then press Enter: ");
await verifyAllowlistRollback({ apiOrigin: STAGING_API_ORIGIN, emails: Object.values(manifest.roleEmails) });
removeLocalArtifacts({ labPath: LAB_PATH, manifestPath: MANIFEST_PATH });
runGuard();
console.log("NFC staging batch, local Lab, manifest, and temporary allowlist access are cleared.");
```

with:

```js
removeLocalArtifacts({ labPath: LAB_PATH, manifestPath: MANIFEST_PATH });
runGuard();
console.log("NFC staging batch, local Lab, and manifest are cleared.");
```

Do not change resource disablement, R2 cleanup, exact batch deletion, environment guards, or local artifact guards.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```powershell
npm.cmd exec -- jest --runInBand --runTestsByPath __tests__/nfc-staging-test.test.ts __tests__/nfc-staging-cli.test.ts
```

Expected: PASS, with both NFC staging suites green and no request to `/api/auth/request` during `prepare-pr` cleanup.

- [ ] **Step 5: Commit the tooling change**

```powershell
git add __tests__/nfc-staging-test.test.ts __tests__/nfc-staging-cli.test.ts scripts/nfc-staging-test-helpers.cjs scripts/nfc-staging-test.cjs
git commit -m "refactor: retire staging email allowlist cleanup"
```

### Task 2: Lock the active open-email policy with a failing governance test

**Files:**
- Modify: `__tests__/external-beta-docs.test.ts`

- [ ] **Step 1: Add the current-policy test**

Add this test inside `describe("1.1.2 external Beta release artifacts", ...)`:

```ts
it("opens external-Beta staging login without widening privileged access", () => {
  const envExample = read(".env.example");
  const checklist = read("docs/EXECUTION-CHECKLIST.md");
  const security = read("docs/SECURITY.md");
  const railway = read("docs/backend/RAILWAY.md");
  const alpha = read("docs/operations/ALPHA-STAGING.md");
  const nfcLab = read("docs/operations/NFC-STAGING-LAB.md");
  const rehearsal = read("docs/operations/REHEARSAL-RECORD.md");
  const qa = read("docs/release/QA-CHECKLIST.md");

  expect(envExample).toContain("Keep empty in active external-Beta staging and production");
  expect(checklist).toContain("外部 Beta staging 对所有格式有效邮箱开放验证码登录");
  expect(security).toContain("登录开放不授予管理员或礼品访问权限");
  expect(railway).toContain("ALPHA_ALLOWED_EMAILS=");
  expect(railway).toContain("GIFT_ADMIN_EMAILS 保持独立");
  expect(alpha).toContain("外部 Beta 已取代本手册的邮箱白名单准入规则");
  expect(nfcLab).toContain("无需追加或移除 `ALPHA_ALLOWED_EMAILS`");
  expect(rehearsal).toContain("2026-08-06 的白名单结果是历史验收证据");
  expect(qa).toContain("此前不在四人开发者名单的受控邮箱");
});
```

- [ ] **Step 2: Run the governance test and verify RED**

Run:

```powershell
npm.cmd exec -- jest --runInBand --runTestsByPath __tests__/external-beta-docs.test.ts
```

Expected: FAIL on the first missing current-policy sentence because the active documents still describe the old Alpha allowlist.

### Task 3: Update active configuration and operating documents

**Files:**
- Modify: `.env.example`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/EXECUTION-CHECKLIST.md`
- Modify: `docs/SECURITY.md`
- Modify: `docs/backend/RAILWAY.md`
- Modify: `docs/operations/ALPHA-STAGING.md`
- Modify: `docs/operations/NFC-STAGING-LAB.md`
- Modify: `docs/operations/REHEARSAL-RECORD.md`
- Modify: `docs/operations/DEPLOYMENT-LOG.md`
- Modify: `docs/release/EXTERNAL-BETA-1.1.2.md`
- Modify: `docs/release/QA-CHECKLIST.md`
- Test: `__tests__/external-beta-docs.test.ts`

- [ ] **Step 1: Make `.env.example` describe the open default exactly**

Replace the two-line comment above `ALPHA_ALLOWED_EMAILS` with:

```env
# Keep empty in active external-Beta staging and production.
# Set a non-empty list only for a separately approved restricted environment.
ALPHA_ALLOWED_EMAILS=
```

- [ ] **Step 2: Mark the new decision as superseding the old active rule**

Append this sentence to the first paragraph of the 2026-08-30 entry in `docs/DECISIONS.md`:

```markdown
本决策取代此前 Alpha 阶段“staging 必须保留四人邮箱白名单”及 NFC Lab 临时追加/移除邮箱的当前执行规则；旧条目只保留为历史证据。
```

- [ ] **Step 3: Update the active checklist and security boundary**

Replace the current `ALPHA_ALLOWED_EMAILS` checklist item in `docs/EXECUTION-CHECKLIST.md` with:

```markdown
- [x] 外部 Beta staging 对所有格式有效邮箱开放验证码登录，`ALPHA_ALLOWED_EMAILS` 保持未设置或空值；`GIFT_ADMIN_EMAILS` 继续只包含获准开发者，`GIFT_URL_ORIGIN=https://staging.onetapreality.com`。
```

Replace the Alpha allowlist paragraph in `docs/SECURITY.md` with:

```markdown
外部 Beta staging 继续使用独立的 `GIFT_TOKEN_PEPPER`、`GIFT_AUTH_PEPPER`、`DEVICE_TOKEN_PEPPER`、R2 凭据、清理密钥和管理员测试邮箱，但 `ALPHA_ALLOWED_EMAILS` 保持未设置或空值，对所有格式有效邮箱开放验证码登录。登录开放不授予管理员或礼品访问权限：管理员仍由独立 `GIFT_ADMIN_EMAILS` 判定，礼品仍需 token、成员角色、激活状态与服务端权限检查。非空 `ALPHA_ALLOWED_EMAILS` 只保留给未来单独批准的受限环境；`GIFT_SHARING_ENABLED=false` 会停止新验证码、认领、发布和礼品读取，管理员停用接口保持可用。
```

- [ ] **Step 4: Update Railway and historical Alpha guidance**

In `docs/backend/RAILWAY.md`, retain the environment-isolation rules but make the active `External Beta staging` environment block begin with:

```env
ALPHA_ALLOWED_EMAILS=
GIFT_URL_ORIGIN=https://staging.onetapreality.com
RELEASE_AUDIENCE=external-beta
APPLE_REVIEW_ACCESS_ENABLED=true
```

Immediately below that block, add:

```markdown
`ALPHA_ALLOWED_EMAILS` 必须未设置或为空，表示任意格式有效邮箱可以请求验证码；`GIFT_ADMIN_EMAILS 保持独立`，不得因开放登录而扩大开发者、NFC 初始化或管理员权限。若未来需要恢复受限环境，必须使用单独批准的环境与新决策，不得在仍服务外部 Beta 的同一 staging API 上恢复四人白名单。
```

At the top of `docs/operations/ALPHA-STAGING.md`, add:

```markdown
> 当前状态：本手册记录已完成的内部 Alpha 隔离验收。2026-08-30 起，外部 Beta 已取代本手册的邮箱白名单准入规则；同一 staging API 的 `ALPHA_ALLOWED_EMAILS` 保持未设置或空值。历史步骤不得用于重新限制正在运行的外部 Beta。
```

Change its current verification bullet to say the old allowlist evidence remains historical and the active external-Beta checklist is authoritative.

- [ ] **Step 5: Update NFC Lab cleanup and QA**

In `docs/operations/NFC-STAGING-LAB.md`, replace the instruction to append three aliases with:

```markdown
3. staging 对所有格式有效邮箱开放验证码登录，三个 `+nfc-*` 派生地址无需追加或移除 `ALPHA_ALLOWED_EMAILS`。确认 `GIFT_ADMIN_EMAILS` 仍只包含获准开发者，不得修改 production。
```

Replace the two allowlist-removal cleanup paragraphs with:

```markdown
测试完成后运行 `npm run nfc:test:prepare-pr`。固定顺序是：停用 bound 礼品、退休 unclaimed 卡、执行并核对 R2 清理、严格按 manifest 中的 card/gift ID 删除本批数据库记录，然后删除本地 Lab 与 manifest 并执行只读 guard。账号登录是 staging 的持续能力，清理不得请求新验证码、修改 `ALPHA_ALLOWED_EMAILS` 或把开放登录误判为残留。

任何 R2、数据库或本地工件清理失败都会保留 disabled 数据与 manifest；重新运行同一命令继续，不要手工删除 manifest。
```

Replace the two allowlist QA bullets in `docs/release/QA-CHECKLIST.md` with:

```markdown
- [ ] 使用一个此前不在四人开发者名单的受控邮箱请求并完成验证码登录，响应与界面不得显示“未受邀请”、网络不可用或原始邮件服务错误。
- [ ] 该账号登录后 `isAdmin=false`，不能进入开发者 NFC 控制台，也不能读取或修改未授权礼品。
```

- [ ] **Step 6: Preserve historical rehearsal evidence and stage a pending deployment record**

Add this note below the title in `docs/operations/REHEARSAL-RECORD.md`:

```markdown
> 2026-08-30 范围更新：2026-08-06 的白名单结果是历史验收证据。当前外部 Beta staging 已批准改为开放有效邮箱登录；旧 403 结果不得作为当前准入要求。
```

Append this pending entry to `docs/operations/DEPLOYMENT-LOG.md`:

```markdown
## 2026-08-31：staging 开放邮箱验证码登录

- 环境：staging
- 服务：Railway API
- 变更：仅移除 `ALPHA_ALLOWED_EMAILS`；不修改 `GIFT_ADMIN_EMAILS`、数据库、R2、Resend、EAS、TestFlight 或 production。
- 状态：待发布负责人批准并执行。
- 验证：执行后记录脱敏 health、受控非管理员邮箱登录和未授权礼品拒绝结果。
- 回滚：恢复获批邮箱名单并重新部署；P0 时优先设置 `GIFT_SHARING_ENABLED=false`。
```

In `docs/release/EXTERNAL-BETA-1.1.2.md`, add `ALPHA_ALLOWED_EMAILS=` to the protected staging configuration block and state that empty is the intentional open-email value, while `GIFT_ADMIN_EMAILS` remains unchanged.

- [ ] **Step 7: Run the focused governance and NFC tests**

Run:

```powershell
npm.cmd exec -- jest --runInBand --runTestsByPath __tests__/external-beta-docs.test.ts __tests__/nfc-staging-test.test.ts __tests__/nfc-staging-cli.test.ts __tests__/alpha-safety.test.ts __tests__/account-auth-api.test.ts __tests__/user-facing-backend-error.test.ts __tests__/gift-admin-auth.test.ts
```

Expected: PASS. This confirms the current documents are consistent, empty allowlist access still works, the restricted-environment error remains mapped, and administrator email authorization remains independent.

- [ ] **Step 8: Commit the documentation contract**

```powershell
git add .env.example __tests__/external-beta-docs.test.ts docs/DECISIONS.md docs/EXECUTION-CHECKLIST.md docs/SECURITY.md docs/backend/RAILWAY.md docs/operations/ALPHA-STAGING.md docs/operations/NFC-STAGING-LAB.md docs/operations/REHEARSAL-RECORD.md docs/operations/DEPLOYMENT-LOG.md docs/release/EXTERNAL-BETA-1.1.2.md docs/release/QA-CHECKLIST.md
git commit -m "docs: open external beta staging login"
```

### Task 4: Run all local delivery gates

**Files:**
- Verify only; no file changes expected.

- [ ] **Step 1: Verify repository whitespace and tracked state**

Run:

```powershell
git diff --check
git status --short --branch
```

Expected: no whitespace errors; branch is `codex/open-staging-email-login` and the worktree is clean.

- [ ] **Step 2: Run lint and type checking**

Run:

```powershell
npm run lint
npm run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 3: Run the complete test suite**

Run:

```powershell
npm run test:ci
```

Expected: all Jest and Node test suites pass. Existing intentional console warnings may appear, but there must be zero failed tests.

- [ ] **Step 4: Build the server bundle**

Run:

```powershell
npm run build:server
```

Expected: Expo API server export exits 0 and produces no tracked-file changes.

### Task 5: Apply the separately approved Railway staging change

**Files:**
- External state: Railway service backing `https://api-staging.onetapreality.com`
- Modify after verification: `docs/operations/DEPLOYMENT-LOG.md`

- [ ] **Step 1: Obtain explicit execution approval**

Ask the release owner to approve this exact external mutation: remove only `ALPHA_ALLOWED_EMAILS` from the staging Railway API service and allow Railway to redeploy. Do not proceed on a general approval for code, EAS, TestFlight, production, databases, R2, or Resend.

- [ ] **Step 2: Change only the staging variable**

Using the release owner's authenticated Railway session, open the API service that serves `api-staging.onetapreality.com`, remove `ALPHA_ALLOWED_EMAILS`, and verify the pending configuration diff contains no other variable or service change. Do not expose variable values, use a production service, or change `GIFT_ADMIN_EMAILS`.

Allow the resulting staging deployment to complete. If Railway proposes any additional service or variable mutation, cancel and stop.

- [ ] **Step 3: Verify health without writing application data**

Run:

```powershell
$health = Invoke-RestMethod -Method Get -Uri 'https://api-staging.onetapreality.com/api/health' -TimeoutSec 15
$health | Select-Object service, database, schemaVersion | ConvertTo-Json
```

Expected: HTTP 200, `service="onetapreality-api"`, `database="ok"`, and `schemaVersion` at least 14.

- [ ] **Step 4: Perform the controlled open-login smoke**

The release owner selects a disposable, controlled mailbox that was not in the former four-developer list and types it directly into the TestFlight App. Request and enter its six-digit code without copying the email, code, token, or raw response into terminal output, Git, screenshots, Issues, or chat.

Expected: the code arrives and login succeeds; the UI does not show “未受邀请” or “网络连接不可用”. The account UI reports no administrator capability, the developer NFC console remains unavailable, and opening an unrelated gift returns the safe access-denied state.

- [ ] **Step 5: Record only redacted evidence**

Replace the pending status in `docs/operations/DEPLOYMENT-LOG.md` with:

```markdown
- 状态：成功。
- 验证：staging health 200、`database=ok`、`schemaVersion>=14`；一名不在原四人名单的受控账号收到验证码并登录，`isAdmin=false`，未授权礼品访问被拒绝。未记录邮箱、验证码、token 或 Secret。
```

Add the execution time with timezone and the approved operations Issue number supplied by the release owner. Do not invent either value.

- [ ] **Step 6: Test and commit the deployment record**

Run:

```powershell
node --test __tests__/active-branding-docs.test.mjs __tests__/team-coordination-docs.test.mjs
npm.cmd exec -- jest --runInBand --runTestsByPath __tests__/external-beta-docs.test.ts
git diff --check
```

Expected: all tests pass and no whitespace errors.

Then commit:

```powershell
git add docs/operations/DEPLOYMENT-LOG.md
git commit -m "docs: record open staging login rollout"
```

If the Railway change or smoke fails, do not mark success. Restore the former approved allowlist, redeploy, verify a controlled outside address gets `403 beta_invite_required` without email delivery, and record the final state as `已回滚` with redacted evidence. For a P0, use the existing `GIFT_SHARING_ENABLED=false` incident procedure first.

### Task 6: Final verification and branch handoff

**Files:**
- Verify only; no file changes expected.

- [ ] **Step 1: Re-run the final quality gates after the deployment record commit**

Run:

```powershell
npm run lint
npm run typecheck
npm run test:ci
npm run build:server
git status --short --branch
git log --oneline origin/main..HEAD
```

Expected: every command exits 0, the worktree is clean, and the log contains the design, tooling, policy documentation, and deployment-record commits.

- [ ] **Step 2: Review the exact branch diff**

Run:

```powershell
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
```

Expected: only the files named in this plan changed and there are no whitespace errors, secrets, complete email addresses, verification codes, tokens, or production configuration mutations.

- [ ] **Step 3: Hand off through the protected-branch workflow**

Use `superpowers:requesting-code-review` to review the final diff, then `superpowers:finishing-a-development-branch` to present push/PR or local handoff choices. Never commit directly to remote `main`; any push and pull request require the user's chosen branch-completion option.
