# OneTapReality Team Coordination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repository-owned coordination templates that make every product, operations, NFC, and incident task traceable without placing secrets or user data in GitHub.

**Architecture:** GitHub Issue Forms collect the minimum ownership, environment, risk, acceptance, and evidence metadata at task creation. A shared PR template and three operations documents define how four contributors move work through a GitHub Project while the release owner remains the only person with external-service write access. A small Node static test protects the record format and is executed by `test:ci`.

**Tech Stack:** GitHub Issue Forms (YAML), Markdown, Node.js built-in test runner, npm scripts.

---

### Task 1: Add a failing coordination-document contract test

**Files:**
- Create: `__tests__/team-coordination-docs.test.mjs`
- Modify: `package.json:72`

- [ ] **Step 1: Write the failing test**

Create `__tests__/team-coordination-docs.test.mjs` with this contract:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const templates = [
  '.github/ISSUE_TEMPLATE/feature.yml',
  '.github/ISSUE_TEMPLATE/operations.yml',
  '.github/ISSUE_TEMPLATE/nfc-card-batch.yml',
  '.github/ISSUE_TEMPLATE/p0-incident.yml',
];

test('coordination templates capture ownership, environment, evidence, and safe records', async () => {
  const files = await Promise.all(templates.map(read));
  for (const file of files) {
    assert.match(file, /id: owner/);
    assert.match(file, /id: environment/);
    assert.match(file, /id: acceptance/);
    assert.match(file, /请勿填写.*(secret|token|验证码)/);
  }

  const operations = await read('.github/ISSUE_TEMPLATE/operations.yml');
  assert.match(operations, /id: approver/);
  assert.match(operations, /id: rollback/);

  const nfc = await read('.github/ISSUE_TEMPLATE/nfc-card-batch.yml');
  assert.match(nfc, /id: card_batch/);
  assert.match(nfc, /完整.*URL.*token/);

  const incident = await read('.github/ISSUE_TEMPLATE/p0-incident.yml');
  assert.match(incident, /GIFT_SHARING_ENABLED=false/);
  assert.match(incident, /id: recovery_approval/);
});

test('coordination guidance names OneTapReality and rejects secret examples', async () => {
  const files = await Promise.all([
    read('.github/PULL_REQUEST_TEMPLATE.md'),
    read('docs/operations/TEAM-COORDINATION.md'),
    read('docs/operations/DEPLOYMENT-LOG.md'),
    read('docs/operations/NFC-CARD-BATCH-LOG.md'),
  ]);
  const content = files.join('\\n');
  assert.match(content, /OneTapReality/);
  assert.match(content, /不得记录/);
  assert.doesNotMatch(content, /gho_[A-Za-z0-9]+/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test __tests__/team-coordination-docs.test.mjs`

Expected: FAIL because `.github/ISSUE_TEMPLATE/feature.yml` does not exist.

- [ ] **Step 3: Register the static test in CI**

Change the `test:ci` script to:

```json
"test:ci": "jest --runInBand && node --test __tests__/app-store-site.test.mjs __tests__/team-coordination-docs.test.mjs"
```

- [ ] **Step 4: Re-run the contract test**

Run: `node --test __tests__/team-coordination-docs.test.mjs`

Expected: still FAIL because the template files remain intentionally absent.

### Task 2: Add GitHub Issue Forms and PR contract

**Files:**
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/ISSUE_TEMPLATE/feature.yml`
- Create: `.github/ISSUE_TEMPLATE/operations.yml`
- Create: `.github/ISSUE_TEMPLATE/nfc-card-batch.yml`
- Create: `.github/ISSUE_TEMPLATE/p0-incident.yml`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`
- Test: `__tests__/team-coordination-docs.test.mjs`

- [ ] **Step 1: Implement `config.yml`**

Disable blank issues and link users to the future canonical GitHub URL `https://github.com/CarterWells111/OneTapReality/blob/main/docs/operations/TEAM-COORDINATION.md` for working rules. The contact link text is `阅读 OneTapReality 协作规则`. Do not use a relative URL because GitHub's template chooser documents external `contact_links` URLs.

- [ ] **Step 2: Implement the feature form**

Use `name: 功能或产品工作项`, `description: 为 OneTapReality 记录一个可交付的产品、App、API、UI 或文案任务`, `title: "[Feature]: "`, and `labels: ["type:feature", "status:backlog"]`.

Required fields are `owner` (input), `scope` (checkbox with app/api/ui/content), `environment` (dropdown local/staging/production/n-a), `risk` (dropdown P0/P1/P2), `goal` (textarea), `acceptance` (textarea), `dependencies` (textarea), and `evidence` (textarea). Every form ends with a required `safe_record` checkbox stating `我未填写 secret、数据库 URL、完整礼品 URL/token、验证码、个人照片或完整邮箱名单。`.

- [ ] **Step 3: Implement the operations form**

Use `name: 外部运维变更`, label `type:operations`, and require `owner`, `environment`, `risk`, `service`, `change`, `acceptance`, `approver`, `rollback`, and `evidence`. `environment` must include local/staging/production and `risk` must include P0/P1/P2. The approval field must state that production and staging external writes require the release owner. Add the same required `safe_record` checkbox.

- [ ] **Step 4: Implement the NFC batch form**

Use `name: NFC 卡批次`, label `type:nfc`, and require `owner`, `environment`, `card_batch`, `card_range`, `write_result`, `sample_check`, `acceptance`, and `evidence`. `environment` is staging/production only. The card-range help text must require a non-secret card-ID range and explicitly prohibit complete gift URL/token values. Add the shared `safe_record` checkbox.

- [ ] **Step 5: Implement the P0 incident form**

Use `name: P0 立即停测事件`, title `"[P0]: "`, labels `["priority:P0", "status:blocked"]`, and require `owner`, `environment`, `incident_time`, `impact`, `immediate_action`, `acceptance`, `evidence`, and `recovery_approval`. The immediate-action description must state `先将 GIFT_SHARING_ENABLED=false，再停止新卡和邀请`. Add the shared `safe_record` checkbox.

- [ ] **Step 6: Implement the PR template**

Require the author to link one Issue, identify the environment and data/privacy effect, list completed checks, attach only a link or description of de-identified evidence, and obtain release-owner approval for any external-service or production effect. Add a prohibition on secret/token/code/email/photo data.

- [ ] **Step 7: Run the contract test to verify it passes the form checks**

Run: `node --test __tests__/team-coordination-docs.test.mjs`

Expected: the first test advances past all Issue Form assertions and fails only because the operations documentation files are absent.

### Task 3: Add operating records and weekly coordination guidance

**Files:**
- Create: `docs/operations/TEAM-COORDINATION.md`
- Create: `docs/operations/DEPLOYMENT-LOG.md`
- Create: `docs/operations/NFC-CARD-BATCH-LOG.md`
- Test: `__tests__/team-coordination-docs.test.mjs`

- [ ] **Step 1: Implement team coordination guidance**

Write `TEAM-COORDINATION.md` with: OneTapReality naming; the seven Project states; Issue claim-before-work rule; the four roles (release owner/full-stack, supporting developer, hardware, UI/content); the production/staging access boundary; and this weekly agenda: review released work, active blockers, next week owners, external changes, and NFC batch state. State that the release owner alone writes Railway, R2, Resend, EAS, Cloudflare, App Store Connect, DNS, and databases.

- [ ] **Step 2: Implement the deployment-log template**

Create a Markdown template containing fields: issue link, date/time, owner, approver, environment, service, change summary, verification evidence, rollback action, final state, and follow-up. It must say `不得记录` secrets, database URLs, complete gift URLs/tokens, verification codes, photos, or full email lists.

- [ ] **Step 3: Implement the NFC batch-log template**

Create a Markdown template containing fields: issue link, batch ID, owner, environment, physical card-ID range, domain class, write result, sample-check result, disabled-card count, and follow-up. It must allow only `staging` or `production` domain class, prohibit complete gift URL/token values, and say `不得记录` secrets or personal data.

- [ ] **Step 4: Run the contract test to verify it passes**

Run: `node --test __tests__/team-coordination-docs.test.mjs`

Expected: PASS with two tests.

### Task 4: Run repository verification and commit locally

**Files:**
- Verify: `package.json`
- Verify: `.github/ISSUE_TEMPLATE/*.yml`
- Verify: `.github/PULL_REQUEST_TEMPLATE.md`
- Verify: `docs/operations/*.md`
- Verify: `__tests__/team-coordination-docs.test.mjs`

- [ ] **Step 1: Scan the new active documentation for banned material**

Run:

```powershell
rg -n -i '旧项目名称|gho_[A-Za-z0-9]+|DATABASE_URL=|完整礼品 URL/token' .github docs/operations __tests__/team-coordination-docs.test.mjs
```

Expected: only intentional policy language may match `完整礼品 URL/token`; there must be no old-project name, token, or database value.

- [ ] **Step 2: Run all quality checks**

Run: `npm.cmd run lint`

Expected: exit code 0.

Run: `npm.cmd run typecheck`

Expected: exit code 0.

Run: `npm.cmd run test:ci`

Expected: Jest and both Node static test files pass. If the desktop command limit interrupts the sequential Jest runner, run a stable sorted test-file list in four non-overlapping `--runInBand --runTestsByPath` batches and run the two Node tests separately.

Run: `npm.cmd run build:server`

Expected: exit code 0 and `dist` is generated locally only.

- [ ] **Step 3: Inspect the patch and commit locally**

Run: `git diff --check`

Expected: no whitespace errors.

Run:

```powershell
git add package.json __tests__/team-coordination-docs.test.mjs .github/ISSUE_TEMPLATE .github/PULL_REQUEST_TEMPLATE.md docs/operations/TEAM-COORDINATION.md docs/operations/DEPLOYMENT-LOG.md docs/operations/NFC-CARD-BATCH-LOG.md
git commit -m "docs: add team coordination templates"
```

Expected: local commit only. Do not push, create GitHub resources, or alter external services.
