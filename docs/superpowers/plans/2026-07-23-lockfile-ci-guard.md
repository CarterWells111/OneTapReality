# Lockfile CI Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the broken npm lockfile and prevent dependency or production-build regressions from being merged into `main`.

**Architecture:** npm remains the authoritative dependency graph validator through clean `npm ci` runs. A GitHub Actions workflow validates the minimum Node 20.19 line and runs the complete Railway-equivalent quality gate on Node 24; repository guidance makes the same checks mandatory for dependency changes.

**Tech Stack:** npm lockfile v3, Node.js 20.19 and 24, GitHub Actions, Expo 54 web export, Jest.

---

### Task 1: Repair the npm lockfile

**Files:**
- Modify: `package-lock.json`

- [ ] **Step 1: Reproduce the broken clean install**

Run:

```powershell
$env:Path = 'C:\Users\carte\AppData\Local\nvm\v24.15.0;' + $env:Path
npm.cmd ci
```

Expected: exit code 1 with `EUSAGE` and missing lockfile entries for `@emnapi/core` and
`@emnapi/runtime`.

- [ ] **Step 2: Regenerate lockfile metadata without changing dependency ranges**

Run:

```powershell
$env:Path = 'C:\Users\carte\AppData\Local\nvm\v24.15.0;' + $env:Path
npm.cmd install --package-lock-only --ignore-scripts --no-audit --no-fund
```

Expected: only `package-lock.json` changes; `package.json` and its open-ended
`engines` / `devEngines` minimum ranges remain unchanged.

- [ ] **Step 3: Verify the repaired clean install**

Run:

```powershell
$env:Path = 'C:\Users\carte\AppData\Local\nvm\v24.15.0;' + $env:Path
npm.cmd ci --ignore-scripts --no-audit --no-fund
```

Expected: exit code 0 without `EUSAGE` or missing lockfile entries.

- [ ] **Step 4: Commit the lockfile repair**

```powershell
git add -- package-lock.json
git commit -m "fix: repair npm lockfile metadata"
```

### Task 2: Add an automated GitHub quality gate

**Files:**
- Create: `.github/workflows/quality-gate.yml`
- Create: `__tests__/ci-workflow.test.ts`

- [ ] **Step 1: Write the failing workflow contract test**

Create `__tests__/ci-workflow.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";

describe("GitHub quality gate", () => {
  const workflowPath = path.join(
    process.cwd(),
    ".github",
    "workflows",
    "quality-gate.yml",
  );

  it("blocks dependency and Railway build regressions on supported Node lines", () => {
    expect(fs.existsSync(workflowPath)).toBe(true);
    const workflow = fs.readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("push:");
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("node-version: 20.19.0");
    expect(workflow).toContain("node-version: 24.x");
    expect(workflow).toContain("npm ci --ignore-scripts");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npm run lint");
    expect(workflow).toContain("npm run typecheck");
    expect(workflow).toContain("npm run test:ci");
    expect(workflow).toContain("npm run build:server");
  });
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```powershell
$env:Path = 'C:\Users\carte\AppData\Local\nvm\v24.15.0;' + $env:Path
npm.cmd run test:ci -- --runTestsByPath __tests__/ci-workflow.test.ts
```

Expected: FAIL because `.github/workflows/quality-gate.yml` does not exist.

- [ ] **Step 3: Add the minimal quality-gate workflow**

Create `.github/workflows/quality-gate.yml`:

```yaml
name: Quality Gate

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: quality-gate-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lockfile-minimum:
    name: Lockfile minimum (Node 20.19)
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20.19.0
          cache: npm
      - run: npm ci --ignore-scripts --no-audit --no-fund

  quality:
    name: Quality (Node 24)
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24.x
          cache: npm
      - run: npm ci --no-audit --no-fund
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:ci
      - run: npm run build:server
```

- [ ] **Step 4: Run the contract test and verify GREEN**

Run:

```powershell
$env:Path = 'C:\Users\carte\AppData\Local\nvm\v24.15.0;' + $env:Path
npm.cmd run test:ci -- --runTestsByPath __tests__/ci-workflow.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the workflow and test**

```powershell
git add -- .github/workflows/quality-gate.yml __tests__/ci-workflow.test.ts
git commit -m "ci: require clean install and production build"
```

### Task 3: Encode the dependency-change rules

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/EXECUTION-CHECKLIST.md`
- Modify: `docs/backend/RAILWAY.md`

- [ ] **Step 1: Add explicit dependency rules to `AGENTS.md`**

Append:

```md
7. 修改依赖时必须同时提交匹配的 `package.json` 与 `package-lock.json`，并在合并前从干净状态运行 `npm ci`。
8. 涉及依赖、Expo 路由或生产构建配置的变更必须运行 `npm run build:server`；已有 `node_modules` 下能启动开发服务器不能替代该检查。
```

- [ ] **Step 2: Add the automated gate to the execution checklist**

Append to `docs/EXECUTION-CHECKLIST.md`:

```md
- [x] GitHub Quality Gate 在 Node 20.19 验证 lockfile 干净安装，并在 Node 24 运行 lint、typecheck、全量测试和 Railway 同款生产构建。
- [ ] `main` 分支保护已要求 `Lockfile minimum (Node 20.19)` 与 `Quality (Node 24)` 两项检查通过后才能合并。
```

- [ ] **Step 3: Document the lockfile failure mode for Railway**

Add to `docs/backend/RAILWAY.md` under common failures:

```md
- Build image 在应用构建前因 `npm ci` / `EUSAGE` 失败：`package-lock.json` 与 `package.json` 或传递 peer 依赖元数据不同步。使用仓库声明的 Node/npm 重新生成 lockfile，随后必须在空依赖状态验证 `npm ci` 和 `npm run build:server`；不要用 `npm install` 能完成或本地 dev server 能启动作为替代证据。
```

- [ ] **Step 4: Commit repository guidance**

```powershell
git add -- AGENTS.md docs/EXECUTION-CHECKLIST.md docs/backend/RAILWAY.md
git commit -m "docs: require clean dependency verification"
```

### Task 4: Verify locally and enforce remotely

**Files:**
- Verify all committed files.
- Update external GitHub branch protection without overwriting unrelated rules.

- [ ] **Step 1: Run all local quality gates**

Run:

```powershell
$env:Path = 'C:\Users\carte\AppData\Local\nvm\v24.15.0;' + $env:Path
npm.cmd ci --no-audit --no-fund
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:ci
npm.cmd run build:server
git diff --check
```

Expected: every command exits with code 0; Jest has zero failures and Expo produces `dist`.

- [ ] **Step 2: Push and create a Pull Request**

```powershell
git push -u origin codex/lockfile-ci-guard
gh pr create --base main --head codex/lockfile-ci-guard --title "ci: guard lockfile and production builds" --body "## Summary`n- repair npm lockfile metadata required by clean installs`n- add Node 20/24 GitHub quality gates`n- require clean install and Railway production build verification`n`n## Verification`n- npm ci`n- npm run lint`n- npm run typecheck`n- npm run test:ci`n- npm run build:server"
```

- [ ] **Step 3: Observe real GitHub Actions**

Run:

```powershell
gh pr checks --watch
```

Expected: `Lockfile minimum (Node 20.19)` and `Quality (Node 24)` both complete successfully.

- [ ] **Step 4: Preserve and extend main branch protection**

Read existing protection and required status checks first:

```powershell
gh api repos/CarterWells111/OneTapReality/branches/main/protection
gh api repos/CarterWells111/OneTapReality/branches/main/protection/required_status_checks
```

If the required-status-checks endpoint succeeds, merge the two new contexts into its existing contexts
and PATCH only that subresource, preserving every unrelated branch protection setting:

```powershell
$checksJson = gh api repos/CarterWells111/OneTapReality/branches/main/protection/required_status_checks
if ($LASTEXITCODE -ne 0) { throw "Required status checks are unavailable; stop without changing protection." }
$checks = $checksJson | ConvertFrom-Json
$contexts = @($checks.contexts) + @("Lockfile minimum (Node 20.19)", "Quality (Node 24)") | Sort-Object -Unique
$payload = @{
  strict = [bool]$checks.strict
  contexts = @($contexts)
} | ConvertTo-Json -Depth 4
$payload | gh api --method PATCH repos/CarterWells111/OneTapReality/branches/main/protection/required_status_checks --input -
```

If protection is unavailable due to repository plan or permissions, do not weaken or replace rules;
report the exact GitHub API response and leave the workflow active.

- [ ] **Step 5: Read back enforcement**

Run:

```powershell
gh api repos/CarterWells111/OneTapReality/branches/main/protection/required_status_checks
```

Expected: strict status checks include both required contexts. Only after this succeeds, mark the
corresponding execution checklist item complete in a follow-up commit and push it.
