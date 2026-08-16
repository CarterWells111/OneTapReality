# Beta Release Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare a clean, reviewable Beta release branch, define a collision-free migration order, and verify the remaining staging variables without deploying.

**Architecture:** Keep the Beta candidate, database phase two, and album-cover feature in separate release trains. The Beta branch remains on schema 7; phase two owns migration 0008; album covers are rebased after phase two and regenerated as migration 0009.

**Tech Stack:** Git worktrees, Drizzle PostgreSQL migrations, Jest, Expo/EAS configuration, Railway staging operations.

---

### Task 1: Create the clean Beta branch

**Files:**
- Modify: `docs/EXECUTION-CHECKLIST.md`
- Modify: `docs/operations/DEPLOYMENT-LOG.md`
- Modify: `docs/operations/REHEARSAL-RECORD.md`

- [ ] Create `codex/beta-release-prep` from the SHA returned by `git ls-remote origin refs/heads/main`.
- [ ] Run `npm ci --no-audit --no-fund`.
- [ ] Cherry-pick only `3eac2d0` and `3d34264` so the branch receives staging domain and Resend evidence but no uncommitted album-cover code.
- [ ] Confirm `git status --short` lists only intentional governance work.

### Task 2: Lock the migration order with a failing test

**Files:**
- Create: `__tests__/beta-release-governance.test.ts`
- Modify: `docs/DECISIONS.md`
- Create: `docs/superpowers/specs/2026-08-16-beta-release-preparation-design.md`
- Create: `docs/superpowers/plans/2026-08-16-beta-release-preparation.md`

- [ ] Add a Jest test requiring `0008_database_phase2`, `0009_shared_album_covers`, separate Beta release trains, and separate approvals.
- [ ] Run `npx jest __tests__/beta-release-governance.test.ts --runInBand` and verify it fails because the decision and documents are absent.
- [ ] Add the minimum decision, design and plan text.
- [ ] Rerun the targeted test and verify it passes.

### Task 3: Verify staging without writes

**Files:**
- Modify only after verified evidence: `docs/operations/REHEARSAL-RECORD.md`
- Modify only after verified evidence: `docs/operations/DEPLOYMENT-LOG.md`

- [ ] Read only the non-secret staging values for `GIFT_SHARING_ENABLED` and `GIFT_URL_ORIGIN`.
- [ ] Record a blocker if either value is missing or differs from the design.
- [ ] Do not print variables, connection strings, allowlists, peppers, R2 credentials or email secrets.
- [ ] Request separate approval before creating a GitHub operations Issue or changing either Railway value.

### Task 4: Verify the local candidate

**Files:**
- No production files beyond the items above.

- [ ] Run `npm run db:check`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run test:ci`.
- [ ] Run `npm run build:server`.
- [ ] Run `git diff --check` and inspect `git status --short --branch`.
- [ ] Commit locally, then request push、PR、GitHub 运维 Issue 和 Railway 变量写入的分别审批；do not deploy or trigger EAS.
