# Staging TestFlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an auditable iOS TestFlight profile that connects only to staging and can be built and submitted later under separate approvals.

**Architecture:** `eas.json` remains the source of truth for build-time API origins and App Store Connect submission IDs. Focused configuration and governance tests prevent the staging TestFlight profile from becoming ad-hoc, targeting production, exposing server secrets, or bypassing approval gates. Existing `alpha` and `production` profiles remain unchanged.

**Review hardening:** The store build explicitly selects EAS `preview`, submit targets the fixed `OneTapReality开发员测试` group, and the release script validates an existing build's app/project, platform, distribution, profile, and status before submission. The build-only resume command must preserve the selected profile, while staging runtime rejects any attempt to build and submit under one approval.

**Tech Stack:** Expo SDK 54, EAS Build/Submit configuration, Jest, Node.js release tooling, Markdown operating documentation.

---

### Task 1: Lock the staging TestFlight contract with a failing test

**Files:**
- Modify: `__tests__/eas-config.test.ts`
- Modify: `__tests__/beta-release-governance.test.ts`

- [ ] **Step 1: Add the failing EAS configuration test**

Extend the parsed config type with `build.staging-testflight` and `submit.staging-testflight`, then assert:

```ts
expect(config.build["staging-testflight"]).toEqual({
  distribution: "store",
  environment: "preview",
  autoIncrement: true,
  env: { EXPO_PUBLIC_API_ORIGIN: "https://api-staging.onetapreality.com" },
});
expect(config.submit["staging-testflight"].ios.ascAppId).toBe("6794186067");
expect(config.submit["staging-testflight"].ios.groups).toEqual([
  "OneTapReality开发员测试",
]);
```

Also iterate the profile environment keys and reject `DATABASE_URL`, `PGPASSWORD`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `RESEND_API_KEY`, `GIFT_TOKEN_PEPPER`, `GIFT_AUTH_PEPPER`, and `GIFT_CARD_CLEANUP_SECRET`.

- [ ] **Step 2: Add the failing governance test**

Require the active decisions, checklist, and TestFlight runbook to state that `staging-testflight` is an internal staging rehearsal path, requires explicit `--profile=staging-testflight`, and does not authorize App Store publication or production access.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath __tests__/eas-config.test.ts __tests__/beta-release-governance.test.ts
```

Expected: FAIL because `build.staging-testflight` and `submit.staging-testflight` do not exist and the active documents do not yet describe the path.

- [ ] **Step 4: Commit the RED tests**

```powershell
git add __tests__/eas-config.test.ts __tests__/beta-release-governance.test.ts
git commit -m "test: require isolated staging TestFlight profile"
```

### Task 2: Add the minimum safe EAS profiles

**Files:**
- Modify: `eas.json`

- [ ] **Step 1: Add the store-distribution build profile**

Add this sibling of `alpha` and `production`:

```json
"staging-testflight": {
  "distribution": "store",
  "environment": "preview",
  "autoIncrement": true,
  "env": {
    "EXPO_PUBLIC_API_ORIGIN": "https://api-staging.onetapreality.com"
  }
}
```

- [ ] **Step 2: Add the matching submit profile**

Add this sibling of `submit.production`:

```json
"staging-testflight": {
  "ios": {
    "ascAppId": "6794186067",
    "groups": ["OneTapReality开发员测试"]
  }
}
```

- [ ] **Step 3: Run the EAS configuration test and verify GREEN**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath __tests__/eas-config.test.ts
```

Expected: PASS with the new profile targeting only the staging API and containing no server secret.

- [ ] **Step 4: Commit the minimal configuration**

```powershell
git add eas.json
git commit -m "build: add staging TestFlight profile"
```

### Task 3: Document approval gates and make governance tests green

**Files:**
- Modify: `docs/DECISIONS.md`
- Modify: `docs/EXECUTION-CHECKLIST.md`
- Modify: `docs/release/TESTFLIGHT-RELEASE.md`
- Modify: `docs/operations/ALPHA-STAGING.md`
- Modify: `docs/operations/IOS-NFC-CARD-TEST.md`
- Test: `__tests__/beta-release-governance.test.ts`

- [ ] **Step 1: Record the release decision**

Add a dated decision stating that `staging-testflight` is store-signed but staging-only, may be separately approved for the same limited NFC rehearsal as `alpha`, and cannot access production or authorize public App Store review.

- [ ] **Step 2: Update the active staging gate**

Allow either an approved `alpha` ad-hoc build or an approved `staging-testflight` internal-group build after local quality and environment isolation checks. Keep three-card, P0, production card, broader tester, payment, and public release gates unchanged.

Update the Alpha staging and iOS NFC card runbooks to accept either artifact for the same staging-only rehearsal. Both paths must use `https://api-staging.onetapreality.com`; only `staging-testflight` may be installed through TestFlight, while `alpha` remains the UDID/ad-hoc path.

- [ ] **Step 3: Add exact build and submit commands to the runbook**

Document the two approvals as separate commands:

```powershell
node scripts/release-ios-testflight.cjs --profile=staging-testflight --no-submit
node scripts/release-ios-testflight.cjs --profile=staging-testflight --build-id=<approved-build-id>
```

State that the first command creates a cloud build and the second uploads an already approved build; neither command is run by this PR. Require the fixed existing internal group `OneTapReality开发员测试`, allow automatic distribution only for that target group, verify all other internal groups have automatic distribution disabled, and forbid clicking App Store review/publication actions. Document the read-only EAS `preview` variable-name audit before build.

- [ ] **Step 3a: Harden build resume and submission identity checks**

Add a failing unit test for the release guard module. Preserve `--profile=staging-testflight` in the build-only resume command, and reject existing build IDs unless project, iOS platform, store distribution, selected profile, and `FINISHED` status all match before submission.

- [ ] **Step 4: Run both focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath __tests__/eas-config.test.ts __tests__/beta-release-governance.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the documentation**

```powershell
git add docs/DECISIONS.md docs/EXECUTION-CHECKLIST.md docs/release/TESTFLIGHT-RELEASE.md docs/operations/ALPHA-STAGING.md docs/operations/IOS-NFC-CARD-TEST.md
git commit -m "docs: add staging TestFlight rehearsal flow"
```

### Task 4: Run release-grade local verification and prepare the PR

**Files:**
- Verify only; no cloud or remote configuration writes.

- [ ] **Step 1: Reconfirm remote main before final checks**

Run `git ls-remote origin refs/heads/main`. If it changed from `e2285081d570477818ae3a521f7a6d3fecde873f`, merge the new `origin/main` into this branch without force pushing and restart all checks.

- [ ] **Step 2: Run the complete repository gate**

Run:

```powershell
npm.cmd ci
npm.cmd run check:lockfile
npm.cmd run db:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:ci
npm.cmd run build:server
```

Expected: every command exits 0.

- [ ] **Step 3: Simulate the iOS staging bundle locally**

Run:

```powershell
$env:EXPO_PUBLIC_API_ORIGIN='https://api-staging.onetapreality.com'
npx.cmd expo export --platform ios --output-dir .expo-staging-testflight-export
Remove-Item Env:EXPO_PUBLIC_API_ORIGIN
```

Expected: Expo produces an iOS bundle successfully. Remove the generated ignored directory after recording only aggregate evidence.

- [ ] **Step 4: Run static iOS and profile checks**

Run `npm.cmd run beta:preflight:ios`, the focused EAS tests, and `git diff --check`. Confirm no production URL was added to the staging profile and no server secret appears in tracked changes.

- [ ] **Step 5: Request code review, fix all Critical/Important findings, and rerun affected checks**

Review the diff from `e2285081d570477818ae3a521f7a6d3fecde873f` to branch HEAD against the design and approval boundaries.

- [ ] **Step 6: Push and create the PR**

Push `codex/staging-testflight` and open a ready PR that explicitly says: no EAS build, App Store Connect submission, TestFlight group assignment, Railway deployment, migration, or production write occurred.
