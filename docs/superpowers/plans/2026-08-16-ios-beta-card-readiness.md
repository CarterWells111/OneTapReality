# iOS Beta Card Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make weeks 1–2 of the four-week Beta explicitly iOS-only, defer Android to a week 3–4 reassessment, add a local no-cloud readiness check, and prepare a complete three-card staging NFC rehearsal.

**Architecture:** Governance tests are the source of enforcement, active operating documents share one iOS-only gate, and a small Node.js preflight validates static EAS/Expo configuration without network access. Remote staging writes, EAS builds, TestFlight, and production operations remain separate approval gates.

**Tech Stack:** Jest, Node.js, Expo/EAS JSON configuration, Markdown operating records, Git.

---

### Task 1: Lock the iOS-only governance contract

**Files:**
- Modify: `__tests__/beta-release-governance.test.ts`

- [ ] Add assertions that the current Beta is iOS-only, Android is deferred and non-blocking, and the iOS card test guide exists.
- [ ] Run `npx jest __tests__/beta-release-governance.test.ts --runInBand` and confirm it fails because the new contract is absent.

### Task 2: Align active operating documents

**Files:**
- Modify: `docs/DECISIONS.md`
- Modify: `docs/EXECUTION-CHECKLIST.md`
- Modify: `docs/operations/ALPHA-STAGING.md`
- Modify: `docs/operations/DEPLOYMENT-LOG.md`
- Modify: `docs/operations/REHEARSAL-RECORD.md`
- Modify: `docs/operations/NFC-CARD-BATCH-LOG.md`
- Modify: `docs/release/QA-CHECKLIST.md`
- Create: `docs/operations/IOS-NFC-CARD-TEST.md`

- [ ] Record iOS-only scope before changing the active gate.
- [ ] Mark already evidenced staging infrastructure as complete, leave the EAS build, P0 drill, and physical card lifecycle open, and move Android to a clearly labeled non-blocking backlog.
- [ ] Define three staging card IDs and exact pass/fail evidence without storing sensitive values.

### Task 3: Add the local iOS Beta preflight

**Files:**
- Create: `scripts/check-ios-beta-readiness.cjs`
- Create: `__tests__/ios-beta-readiness.test.ts`
- Modify: `package.json`

- [ ] Write tests for valid configuration and failures caused by wrong origin, missing staging Associated Domain, missing NFC plugin, wrong Bundle ID, and server-secret leakage.
- [ ] Run `npx jest __tests__/ios-beta-readiness.test.ts --runInBand` and confirm failure because the module does not exist.
- [ ] Implement the minimal static checker and add `npm run beta:preflight:ios`.
- [ ] Re-run both targeted test files and the preflight command.

### Task 4: Verify the complete local gate

- [ ] Run `npm ci`.
- [ ] Run `npm run check:lockfile` and `npm run db:check`.
- [ ] Run `npm run lint`, `npm run typecheck`, `npm run test:ci`, and `npm run build:server`.
- [ ] Run `npm run worker:check` and `npm run beta:preflight:ios`.
- [ ] Review `git diff --check`, the final diff, and confirm no production deployment or cloud build occurred.

### Task 5: Request remote approvals and execute the physical rehearsal

- [ ] Request separate approval for a disposable staging gift/full lifecycle write rehearsal.
- [ ] Request separate approval for the staging `GIFT_SHARING_ENABLED` P0 toggle and restoration.
- [ ] Request separate approval for an EAS iOS `alpha` build; do not submit to TestFlight automatically.
- [ ] On the user's iPhone, execute `docs/operations/IOS-NFC-CARD-TEST.md` for three staging cards and record only sanitized evidence.
- [ ] Do not proceed to production card provisioning, payment, shipment, or production deployment without a new approval after all gates are green.
