# iOS-only Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Android product/build/App Links declarations while preserving iOS, Web, shared business logic, and historical unreferenced artwork.

**Architecture:** Treat Expo/EAS/npm configuration and the public App Link worker as the supported-platform boundary. Keep runtime platform guards intact so dependency code remains stable, and lock the product promise through configuration and documentation tests.

**Tech Stack:** Expo SDK 54, EAS JSON, Node test runner, Jest, PowerShell static-site builder.

---

### Task 1: Lock the iOS-only configuration contract

**Files:**
- Modify: `__tests__/app-config.test.ts`
- Modify: `__tests__/brand-copy.test.tsx`

- [ ] Replace Android-positive assertions with assertions that `expo.android`, `development-android`, and the npm `android` script are absent.
- [ ] Run `jest --runInBand --runTestsByPath __tests__/app-config.test.ts __tests__/brand-copy.test.tsx` and confirm RED against current configuration.
- [ ] Remove the Android blocks from `app.json`, `eas.json`, and `package.json`.
- [ ] Re-run the focused tests and confirm GREEN.

### Task 2: Remove Android Digital Asset Links

**Files:**
- Modify: `__tests__/app-store-site.test.mjs`
- Modify: `website/worker/index.js`
- Modify: `website/scripts/build-static-site.ps1`
- Delete: `website/.well-known/assetlinks.json`

- [ ] Change the website test to require no Android asset file, placeholder, route, or generated header.
- [ ] Run the Node website test and confirm RED.
- [ ] Remove Android asset loading and serving while retaining Apple AASA behavior.
- [ ] Re-run the Node website test and confirm GREEN.

### Task 3: Replace the deferred-Android decision

**Files:**
- Modify: `docs/DECISIONS.md`
- Modify: `docs/EXECUTION-CHECKLIST.md`
- Modify: `docs/NFC-HANDOFF.md`
- Modify: `docs/SECURITY.md`
- Modify: `docs/backend/RAILWAY.md`
- Modify: `docs/operations/ALPHA-STAGING.md`
- Modify: `docs/operations/DEPLOYMENT-LOG.md`
- Modify: `docs/operations/REHEARSAL-RECORD.md`
- Modify: `docs/release/QA-CHECKLIST.md`
- Modify: `docs/release/PRIVACY.md`
- Modify: `__tests__/beta-release-governance.test.ts`

- [ ] Add governance assertions for permanent iOS-only scope and absence of an Android backlog promise.
- [ ] Confirm the focused governance test fails.
- [ ] Add the superseding decision and update active operational/release wording.
- [ ] Confirm the governance test passes.

### Task 4: Verify the complete branch

- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run test:ci`.
- [ ] Run `npm run build:server`.
- [ ] Run `git diff --check` and inspect the scoped diff.
- [ ] Do not commit, push, deploy, or start a cloud build without separate approval.
