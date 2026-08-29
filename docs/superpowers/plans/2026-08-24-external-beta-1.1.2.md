# OneTapReality 1.1.2 External Beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task, with a fresh specification review and code-quality review after each task. Every behavior change follows red-green-refactor.

**Goal:** Produce a clean, reviewable 1.1.2 external TestFlight candidate that exposes only real product behavior, supports guest local libraries and complete account deletion, adds invite-only content safety and read-only in-app NFC scanning, and can be built only against isolated staging with verifiable release metadata.

**Architecture:** Separate the external-beta binary at build time, make local ownership explicit at the repository boundary, keep destructive cloud deletion as a revocation-first idempotent job, add moderation as authenticated gift-domain transactions, and funnel NFC/Universal Links through one strict environment-aware parser. Release scripts and static scans enforce the same invariants before EAS receives a build.

**Tech Stack:** Expo Router 6, React Native 0.81/React 19, Expo SDK 54, TypeScript, SQLite local storage, Drizzle ORM/PostgreSQL, private Cloudflare R2, Resend, EAS Build/TestFlight, Jest and Testing Library.

---

## Task 1: Establish the 1.1.2 external release contract

**Files:**
- Modify: `package.json`
- Modify: `app.json`
- Modify: `app.config.ts`
- Modify: `eas.json`
- Modify: `scripts/check-ios-beta-readiness.cjs`
- Modify: `scripts/release-ios-testflight.cjs`
- Modify: `scripts/release-ios-testflight-guards.cjs`
- Modify: `__tests__/beta-release-governance.test.ts`
- Modify: `__tests__/release-ios-testflight.test.ts`
- Create: `__tests__/external-beta-surface.test.ts`

- [ ] Write failing tests for version 1.1.2, `beta-external`, store distribution, staging origin, `external-beta` audience, clean-commit requirement, missing external `submit.ios.groups`, profile-aware preflight, forbidden bypass flags, and forbidden routes/imports/strings.
- [ ] Run the focused tests and record the expected failures.
- [ ] Add a typed build-audience helper, configure `beta-external`, make preflight consume `--profile`, and make the release script reject dirty worktrees, `--allow-dirty`, `--skip-checks`, profile/origin/audience/version/fingerprint mismatches.
- [ ] Keep internal and external build settings separate and prove no Secret is serialized into client config.
- [ ] Run the focused tests, `npm run check:lockfile`, and `npm run beta:preflight:ios -- --profile beta-external` to green.
- [ ] Commit the release-contract slice.

## Task 2: Remove non-public surfaces and correct external copy

**Files:**
- Modify: `src/app/(tabs)/_layout.tsx`
- Modify: `src/app/(tabs)/index.tsx`
- Modify: `src/app/(tabs)/profile.tsx`
- Modify: `src/app/settings/index.tsx`
- Modify: `src/app/activate.tsx`
- Modify/Delete: `src/app/(tabs)/shop.tsx`
- Modify/Delete: `src/app/shop/[skuId].tsx`
- Modify/Delete: `src/app/shop/orders.tsx`
- Modify/Delete: `src/app/shop/favorites.tsx`
- Modify/Delete: `src/app/backend/index.tsx`
- Modify/Delete: `src/app/nfc-demo/[city].tsx`
- Modify: `src/app/feedback/index.tsx`
- Modify: `src/features/export/share-action-sheet.ts`
- Modify: `src/app/city-map/index.tsx`
- Modify: `src/app/city-map/[city].tsx`
- Modify: `src/app/city/[city]/manage.tsx`
- Modify: `src/features/cities/city-workspace-content.tsx`
- Modify: `src/features/cities/city-illustrations.ts`
- Modify/Create: focused tests under `__tests__/activate-route.test.tsx`, `__tests__/feedback-store.test.ts`, `__tests__/share-action-sheet.test.ts`, `__tests__/city-*.test.tsx`, and `__tests__/external-beta-surface.test.ts`

- [ ] Write failing route/component/static-scan tests proving the shop, commerce promises, developer/admin/backend labels, raw errors, fake city counts, English slugs, `.tralbum`, silent multi-share and fake feedback success remain visible.
- [ ] Run the focused tests and record red.
- [ ] Remove external navigation and route modules for commerce/developer surfaces; provide a public-only activate implementation with no `DeveloperNfcConsole` import.
- [ ] Apply the approved privacy and local-rule copy, formal city fallbacks, Chinese city management/error mappings, one-book PDF export, and `mailto:support@onetapreality.com`/TestFlight feedback instructions.
- [ ] Run all focused UI/static-scan tests and lint/typecheck.
- [ ] Commit the public-surface slice.

## Task 3: Make guest and account local libraries explicit

**Files:**
- Modify: `src/features/auth/local-account.ts`
- Modify: `src/features/auth/auth-provider.tsx`
- Modify: `src/features/auth/account-route-gate.tsx`
- Modify: `src/features/memories/memories-provider.tsx`
- Modify: `src/storage/memory-repository.ts`
- Modify: `src/storage/memory-edit-draft-repository.ts`
- Modify: `src/app/(tabs)/index.tsx`
- Modify: `src/app/settings/index.tsx`
- Create: `src/features/auth/local-library-owner.ts`
- Create: `src/features/auth/guest-library-migration.ts`
- Modify/Create tests: `__tests__/local-account.test.ts`, `__tests__/auth-provider.test.tsx`, `__tests__/memories-provider-auth.test.tsx`, `__tests__/memory-account-isolation.test.ts`, `__tests__/memory-repository.test.ts`, `__tests__/memory-edit-draft-repository.test.ts`, `__tests__/local-library-upgrade.test.ts`

- [ ] Write failing repository/provider tests for `guest`, normalized `account:<email>`, logout-to-guest, no cross-account reads, guest CRUD/export without login, explicit migration choice, atomic rollback, and 1.1.1 data upgrade.
- [ ] Run the focused tests and record red.
- [ ] Introduce `LocalLibraryOwner` and thread it through every local memory/draft operation; gate only cloud actions.
- [ ] Implement the first-login choice and transaction-safe migration, including deterministic collision handling and persisted per-account choice without silent migration.
- [ ] Run focused persistence/provider/UI tests plus lint/typecheck.
- [ ] Commit the local-library slice.

## Task 4: Add revocation-first permanent account deletion

**Files:**
- Create: `drizzle/0012_external_beta_accounts_and_safety.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/server/db/schema.ts`
- Modify: `src/app/api/health+api.ts`
- Modify: `src/server/auth/repository.ts`
- Modify: `src/server/auth/session-auth.ts`
- Create: `src/server/auth/account-deletion.ts`
- Create: `src/app/api/account/deletion-challenge+api.ts`
- Create: `src/app/api/account+api.ts`
- Modify: `src/server/maintenance/run-gift-maintenance.ts`
- Modify: `src/services/backend/api-client.ts`
- Modify: `src/app/privacy/index.tsx`
- Create/Modify tests: `__tests__/backend-migrations.test.ts`, `__tests__/account-deletion-api.test.ts`, `__tests__/account-deletion-repository.test.ts`, `__tests__/account-session-auth.test.ts`, `__tests__/gift-maintenance-*.test.ts`, `__tests__/privacy-screen.test.tsx`

- [ ] Write failing migration/API/repository tests for challenge expiry/one-time use, confirmation text, wrong code, immediate global session revocation, 202 receipt, owned-gift disablement, idempotent cleanup/retry, support notification, and preservation of guest local data.
- [ ] Run focused tests and record red.
- [ ] Add challenge/job/account-state storage and update the schema health floor.
- [ ] Implement authenticated challenge issuance using existing mail/rate-limit primitives, transactional delete acceptance, and idempotent maintenance cleanup including private media objects.
- [ ] Split the privacy UI into local-library deletion and permanent account/cloud deletion with the full confirmation flow; clear only the deleted account namespace locally after acceptance.
- [ ] Run database, API, maintenance, UI and security tests plus `npm run db:check`.
- [ ] Commit the account-deletion slice.

## Task 5: Add Beta-only Apple review access and fixtures

**Files:**
- Modify: `src/server/auth/repository.ts`
- Modify: `src/app/api/auth/request+api.ts`
- Modify: `src/app/api/auth/verify+api.ts`
- Create: `src/server/auth/apple-review-access.ts`
- Create: `src/server/auth/apple-review-fixtures.ts`
- Modify: `scripts/check-ios-beta-readiness.cjs`
- Create/Modify tests: `__tests__/apple-review-access.test.ts`, `__tests__/account-auth-api.test.ts`, `__tests__/beta-release-governance.test.ts`

- [ ] Write failing tests proving exact normalized-email matching, staging plus external-beta gating, rate limiting, no code/email logs, production disablement, and idempotent owner/viewer/editor/claimable fixture reset.
- [ ] Run the focused tests and record red.
- [ ] Implement server-only Secret parsing and the fixed-code branch without adding any client/public environment variable.
- [ ] Seed/reset review fixtures after verified login using existing gift transactions and clearly isolated staging identifiers.
- [ ] Extend production/external preflight assertions and run focused tests plus server build.
- [ ] Commit the review-access slice without credentials.

## Task 6: Add report, block and leave governance

**Files:**
- Modify: `drizzle/0012_external_beta_accounts_and_safety.sql`
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/gifts/repository.ts`
- Modify: `src/server/gifts/member-access.ts`
- Create: `src/server/gifts/content-safety.ts`
- Create: `src/app/api/gifts/[giftId]/reports+api.ts`
- Create: `src/app/api/gifts/[giftId]/blocks+api.ts`
- Create: `src/app/api/gifts/[giftId]/membership+api.ts`
- Modify: `src/services/backend/api-client.ts`
- Modify: `src/app/gifts/shared/[id].tsx`
- Modify: `src/app/gifts/[id].tsx`
- Create/Modify tests: `__tests__/gift-content-safety-api.test.ts`, `__tests__/gift-content-safety-repository.test.ts`, `__tests__/gift-shared-viewer.test.tsx`, `__tests__/gift-owner-management.test.tsx`

- [ ] Write failing tests for the six reason values, snapshot-version capture, immediate reporter hide, sanitized support notice, duplicate idempotency, bidirectional reinvite prevention, relationship validation, owner leave rejection and viewer/editor leave success.
- [ ] Run focused tests and record red.
- [ ] Add report/block/disposition schema and repository transactions; enforce blocks in every invitation, claim and member-add path.
- [ ] Implement authenticated routes and Chinese actionable client controls without raw internal errors.
- [ ] Run migrations, API/domain/UI tests and server build.
- [ ] Commit the content-safety slice.

## Task 7: Add environment-safe read-only in-app NFC scanning and minimal permissions

**Files:**
- Create: `src/services/nfc/gift-link-parser.ts`
- Create: `src/services/nfc/gift-link-scanner.ts`
- Create: `src/features/gifts/gift-nfc-scanner.tsx`
- Modify: `src/app/(tabs)/index.tsx`
- Modify: `src/app/_layout.tsx`
- Modify: photo picker/export call sites discovered by `rg "request(MediaLibrary|MediaLibraryPermissions|mediaLibrary|launchImageLibrary)" src`
- Modify: `app.json`
- Modify: `scripts/check-ios-beta-readiness.cjs`
- Create/Modify tests: `__tests__/gift-link-parser.test.ts`, `__tests__/gift-link-scanner.test.ts`, `__tests__/gift-entry.test.tsx`, `__tests__/photo-permissions.test.ts`, `__tests__/beta-release-governance.test.ts`

- [ ] Write failing parser/scanner tests for HTTPS/current host/strict `/gift/<token>`, malformed and foreign URLs, no UID/write/token logging, cancellation, and route handoff; add static permission tests proving no preflight full-library request and add-only export.
- [ ] Run focused tests and record red.
- [ ] Implement a NDEF URL-only scanner with lifecycle cleanup and a home “扫描礼品” entry that shares the Universal Link route.
- [ ] Remove unnecessary full photo-library permission requests, request add-only only when saving, and add accurate Chinese/English photo read/save/NFC purpose strings while retaining iOS 15.1 and TAG-only background support.
- [ ] Run focused native/config tests, lint/typecheck and iOS preflight.
- [ ] Commit the NFC/permission slice.

## Task 8: Create review metadata, privacy and tester evidence artifacts

**Files:**
- Modify: `docs/release/PRIVACY.md`
- Modify: `docs/release/TESTFLIGHT-RELEASE.md`
- Modify: `docs/release/QA-CHECKLIST.md`
- Create: `docs/release/EXTERNAL-BETA-1.1.2.md`
- Create: `docs/release/APP-STORE-CONNECT-1.1.2.md`
- Create: `docs/release/NFC-TEST-EVIDENCE.template.md`
- Create: `docs/release/BETA-TESTER-MATRIX.template.md`
- Modify/Create tests: `__tests__/gift-maintenance-docs.test.ts`, `__tests__/beta-release-governance.test.ts`, `__tests__/external-beta-docs.test.ts`

- [ ] Write failing documentation-contract tests for exact Beta description, What to Test, support/privacy/marketing URLs, App Privacy declarations, UGC rating guidance, review-account placeholders, no commerce promises, manual release, 3/3/2/2 tester roles and stop conditions.
- [ ] Run focused tests and record red.
- [ ] Add non-secret App Store Connect copy/checklists and synchronize website-policy requirements for Resend, Railway/PostgreSQL, R2, retention, deletion and reporting.
- [ ] Convert existing NFC validation into a sanitized evidence template and list only uncovered physical-device checks.
- [ ] Run focused documentation tests and secret scans.
- [ ] Commit the release-artifact slice.

## Task 9: Full verification, archive audit and release handoff

**Files:**
- Modify only defects revealed by verification, each with a regression test first.

- [ ] From the clean worktree run `npm ci`, `npm run check:lockfile`, `npm run lint`, `npm run typecheck`, `npm run test:ci`, `npm run build:server`, and `npm run beta:preflight:ios -- --profile beta-external`.
- [ ] Run external route/string/module/secret scans and inspect `git diff --check`, lockfile consistency and the complete diff against `origin/main`.
- [ ] Obtain a fresh specification review and code-quality review; fix every required issue with a failing regression test and repeat the affected gates.
- [ ] Request explicit release approval before any chargeable EAS build. After approval, build only from the clean committed branch and record version, build number, commit, profile, staging origin, audience, fingerprint and EAS build ID.
- [ ] Inspect the final archive for TAG-only NFC entitlement, Associated Domains, localized purpose strings, privacy manifest and `ITSAppUsesNonExemptEncryption = false`.
- [ ] Request separate explicit approval before submission/upload if required by the release runbook. Upload to App Store Connect without assigning an internal group through EAS.
- [ ] Fill App Store Connect with the reviewed non-secret metadata and secrets supplied by the account holder, manually add the uploaded build to the existing external group, and submit Beta App Review.
- [ ] After Apple approval and internal smoke, invite the supplied 10-email roster once; never enable a public link or grant App Store Connect access.

## Completion criteria

- No Build 22 external assignment and no public App Store submission.
- All automated gates and final archive checks are green from a clean commit.
- External binary exposes no commerce/developer/backend/internal-secret surface and only calls staging.
- Guest CRUD/export, explicit migration, complete in-app account deletion, review access, report/block/leave and old-device NFC scan are verified.
- App Store Connect metadata, website disclosures, reviewer path and 10-person matrix match the binary's real behavior.
- Missing private inputs (review email/code/contact phone and tester emails) remain clearly marked as operator-only blockers and never enter Git.
