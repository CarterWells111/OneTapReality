# Shared Album Collaboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make NFC-opened shared albums reliably preview in full and support owner-selectable viewer/editor access to the same versioned cloud album.

**Architecture:** Extend gift membership with an editor role, use the existing private R2 publication pipeline for optimistic-concurrency shared edits, and keep destructive/member administration owner-controlled through explicit requests. Both invited roles consume one complete snapshot DTO and NFC activation navigates directly to that snapshot.

**Tech Stack:** Expo Router, React Native, TypeScript, Drizzle ORM/PostgreSQL, private R2 signed URLs, Jest/React Native Testing Library.

---

## File map

- `drizzle/0010_shared_album_collaboration.sql`: immutable role/check/index changes and management-request storage.
- `src/server/db/schema.ts`: Drizzle definitions and types for editor membership and management requests.
- `src/server/gifts/repository.ts`: role-aware access, atomic version publication, permission changes, and request lifecycle.
- `src/server/gifts/member-access.ts`: centralized owner/viewer/editor authorization predicates used by routes.
- `src/server/gifts/shared-publication.ts`: payload validation and R2 upload-session preparation shared by owners/editors.
- `src/app/api/my-gifts/[id]/members+api.ts`: invite with role and owner role updates/removals.
- `src/app/api/gifts/invited/[id]/album+api.ts`: identical complete snapshot reads for viewer/editor.
- `src/app/api/gifts/invited/[id]/publish+api.ts`: editor upload-session creation/completion with `baseVersion` conflict control.
- `src/app/api/gifts/invited/[id]/management-requests+api.ts`: editor request creation/listing.
- `src/app/api/my-gifts/[id]/management-requests+api.ts`: owner approval/rejection.
- `src/services/backend/api-client.ts`: role, editing, conflict, member-role, and request DTOs.
- `src/features/gifts/shared-album-mapper.ts`: stable snapshot-to-Canvas mapping shared by reader/editor.
- `src/features/gifts/shared-album-editor.tsx`: existing Canvas editor adapter and version submission UI.
- `src/app/gifts/shared/[id].tsx`: complete preview and role-gated edit entry.
- `src/features/gifts/gift-entry.tsx`: direct post-activation navigation.
- `src/app/gifts/[id].tsx`: invite/role management and approval UI.

### Task 1: Lock the collaboration contract in migrations and types

**Files:**
- Create: `drizzle/0010_shared_album_collaboration.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/server/db/schema.ts`
- Test: `__tests__/backend-migrations.test.ts`
- Test: `__tests__/gift-repository.test.ts`

- [ ] **Step 1: Write failing migration tests** asserting schema version `10`, `gift_members.role` accepts `editor`, and `gift_management_requests` has requester, action, target, status, timestamps, and gift indexes.
- [ ] **Step 2: Run `npx jest --runInBand __tests__/backend-migrations.test.ts __tests__/gift-repository.test.ts`** and confirm failure because migration 0010 and editor role do not exist.
- [ ] **Step 3: Add immutable migration 0010** replacing the role check with `('owner','viewer','editor')`, creating the request table with constrained action/status values, and advancing `app_schema_meta` to 10.
- [ ] **Step 4: Mirror the migration in Drizzle types** using `GiftMemberRole = "owner" | "viewer" | "editor"` and typed request rows; do not alter migrations 0000-0009.
- [ ] **Step 5: Re-run the focused tests** and expect PASS.

### Task 2: Centralize activated member authorization

**Files:**
- Create: `src/server/gifts/member-access.ts`
- Modify: `src/server/gifts/repository.ts`
- Test: `__tests__/gift-repository.test.ts`
- Test: `__tests__/gift-invited-api.test.ts`

- [ ] **Step 1: Add failing tests** for activated viewer/editor reads, editor-only writes, owner writes, wrong-email denial, missing activation denial, removed-member denial, disabled-gift denial, and role downgrade denial.
- [ ] **Step 2: Run the two focused test files** and verify editor cases fail under the current hard-coded `viewer` predicates.
- [ ] **Step 3: Implement `getActivatedGiftMemberAccess`** returning only server-derived gift/member/role/album data after normalized-email, activation user ID, gift status, and allowed-role checks.
- [ ] **Step 4: Replace hard-coded viewer checks** in invited listing, token access, activation, and album reads while keeping unactivated members invisible.
- [ ] **Step 5: Run the focused tests** and expect PASS.

### Task 3: Invite with a role and change it later

**Files:**
- Modify: `src/server/gifts/repository.ts`
- Modify: `src/app/api/my-gifts/[id]/members+api.ts`
- Modify: `src/app/api/gifts/[token]/members+api.ts`
- Modify: `src/services/backend/api-client.ts`
- Test: `__tests__/gift-members-api.test.ts`
- Test: `__tests__/backend-client.test.ts`

- [ ] **Step 1: Add failing API/client tests** for POST `{ email, role }`, PATCH `{ email, role }`, invalid/owner role rejection, non-owner denial, and unchanged activation after viewer/editor switches.
- [ ] **Step 2: Run the focused tests** and confirm POST ignores role and PATCH is unavailable.
- [ ] **Step 3: Change `addGiftMember` and add `updateGiftMemberRole`** so only viewer/editor are accepted and member-count locking remains transaction-safe.
- [ ] **Step 4: Add owner-only PATCH routes and typed client methods** returning the compatible member list with the new role union.
- [ ] **Step 5: Run the focused tests** and expect PASS.

### Task 4: Fix NFC direct preview and complete snapshot mapping

**Files:**
- Modify: `src/features/gifts/gift-entry.tsx`
- Modify: `src/app/gifts/shared/[id].tsx`
- Create: `src/features/gifts/shared-album-mapper.ts`
- Modify: `src/services/backend/api-client.ts`
- Test: `__tests__/gift-entry.test.tsx`
- Test: `__tests__/gift-shared-viewer.test.tsx`
- Test: `__tests__/gift-invited-api.test.ts`

- [ ] **Step 1: Add failing tests** expecting activation to navigate directly to `/gifts/shared/gift-1`, and viewer/editor snapshots to produce identical Canvas pages containing every text element, layout property, background, and media URI.
- [ ] **Step 2: Run the three focused tests** and confirm the current `/gifts?open=` redirect and implicit media ordering fail expectations.
- [ ] **Step 3: Route directly after activation** and return `role` plus stable media references from the invited album endpoint.
- [ ] **Step 4: Extract `mapSharedSnapshotToStoryPages`** with stable media-ID resolution and legacy position fallback; use it in the shared screen.
- [ ] **Step 5: Run the focused tests** and expect PASS for both roles and legacy snapshots.

### Task 5: Add optimistic-concurrency shared publication

**Files:**
- Create: `src/server/gifts/shared-publication.ts`
- Modify: `src/server/gifts/repository.ts`
- Create: `src/app/api/gifts/invited/[id]/publish+api.ts`
- Modify: `src/app/api/my-gifts/[id]/publish+api.ts`
- Modify: `src/services/backend/api-client.ts`
- Test: `__tests__/gift-editor-publish-api.test.ts`
- Test: `__tests__/gift-repository.test.ts`

- [ ] **Step 1: Add failing tests** for editor session creation, viewer rejection, base-version requirement, R2 metadata verification, direct version increment, stale `baseVersion` conflict, simultaneous submit single-winner behavior, and revoked-role completion denial.
- [ ] **Step 2: Run the focused tests** and verify editor publication is unavailable.
- [ ] **Step 3: Extract common publication validation** so object keys remain server-generated and payload media can reference only current-album media or verified new uploads.
- [ ] **Step 4: Extend publication sessions with actor/member and base version** and complete under a per-gift lock; return `409 gift_album_version_conflict` without replacing the current snapshot when versions differ.
- [ ] **Step 5: Implement invited publish POST/PUT** with authorization at both phases and reuse the same completion path for owners.
- [ ] **Step 6: Run the focused tests** and expect PASS.

### Task 6: Reuse the complete Canvas editor for editor members

**Files:**
- Create: `src/features/gifts/shared-album-editor.tsx`
- Modify: `src/app/gifts/shared/[id].tsx`
- Modify: `src/features/canvas/book-canvas-editor.tsx`
- Modify: `src/services/backend/api-client.ts`
- Test: `__tests__/gift-shared-editor.test.tsx`
- Test: `__tests__/book-canvas-editor.test.tsx`

- [ ] **Step 1: Add failing component tests** proving editor members can add/remove/reorder pages, add/remove photos, edit text/layout, and submit while viewers see no edit control.
- [ ] **Step 2: Run the focused tests** and verify the current screen is reader-only.
- [ ] **Step 3: Build `SharedAlbumEditor` as an adapter around `BookCanvasEditor`** using the shared mapper, local temporary image selection, upload preparation, and explicit submit state.
- [ ] **Step 4: Handle `gift_album_version_conflict`** by preventing retry of stale state and offering reload of the latest shared version; handle downgrade/removal as access loss.
- [ ] **Step 5: Run the focused tests** and expect PASS.

### Task 7: Add owner permission controls

**Files:**
- Modify: `src/app/gifts/[id].tsx`
- Modify: `src/services/backend/api-client.ts`
- Test: `__tests__/gift-owner-management.test.tsx`

- [ ] **Step 1: Add failing UI tests** for choosing viewer/editor during invite, changing role later, clear role labels, and owner-only controls.
- [ ] **Step 2: Run the focused test** and confirm no permission selector exists.
- [ ] **Step 3: Add accessible role controls** wired to POST/PATCH, preserving existing member cap and showing that both roles require NFC activation.
- [ ] **Step 4: Run the focused test** and expect PASS.

### Task 8: Add controlled management requests

**Files:**
- Modify: `src/server/gifts/repository.ts`
- Create: `src/app/api/gifts/invited/[id]/management-requests+api.ts`
- Create: `src/app/api/my-gifts/[id]/management-requests+api.ts`
- Modify: `src/services/backend/api-client.ts`
- Modify: `src/app/gifts/shared/[id].tsx`
- Modify: `src/app/gifts/[id].tsx`
- Test: `__tests__/gift-management-requests.test.ts`
- Test: `__tests__/gift-management-request-ui.test.tsx`

- [ ] **Step 1: Add failing tests** for editor requests to delete the shared album, remove a member, or change a member role; reject self-escalation, viewer requests, duplicate decisions, and non-owner approval.
- [ ] **Step 2: Run the focused tests** and verify request storage/routes do not exist.
- [ ] **Step 3: Implement request creation and owner decision transactions** with pending/approved/rejected status and revalidation at approval time.
- [ ] **Step 4: Add editor request actions and owner approval UI**; owner direct management remains immediate.
- [ ] **Step 5: Run the focused tests** and expect PASS.

### Task 9: Update security, privacy, and NFC coordination documentation

**Files:**
- Modify: `docs/NFC-API-COORDINATION.md`
- Modify: `docs/NFC-HANDOFF.md`
- Modify: `docs/SECURITY.md`
- Modify: `docs/release/PRIVACY.md`
- Test: `__tests__/privacy-screen.test.tsx`
- Test: `__tests__/team-coordination-docs.test.mjs`

- [ ] **Step 1: Add failing documentation assertions** for editor upload consent, direct version publication, optimistic conflicts, role revocation, management approval, and local-original separation.
- [ ] **Step 2: Run the focused tests** and confirm the current viewer-only wording fails.
- [ ] **Step 3: Update documentation and in-app privacy copy** without claiming real-time collaboration or physical-card/link distinction.
- [ ] **Step 4: Run the focused tests** and expect PASS.

### Task 10: Local verification and approval checkpoint

**Files:**
- Verify only; do not stage, commit, push, deploy, or build.

- [ ] **Step 1: Run `npm run lint`** and expect zero errors.
- [ ] **Step 2: Run `npm run typecheck`** and expect zero errors.
- [ ] **Step 3: Run `npm run test:ci`** and expect all suites/tests PASS.
- [ ] **Step 4: Run `git diff --check`** and expect no whitespace errors.
- [ ] **Step 5: Present the local diff and test evidence to the user for approval.** Do not run `npm run build:server`, create a commit, stage files, push, deploy, or mutate any remote until the user explicitly approves those actions.
- [ ] **Step 6: After explicit approval only, run the required `npm run build:server`** and report its result before any separately authorized Git/remote action.

## Self-review

- Spec coverage: viewer/editor invite and switching, complete preview, NFC direct open, full editor reuse, direct version publication, stale-write rejection, destructive/member-management approval, revocation, R2 isolation, and test/build approval boundaries are each assigned above.
- Placeholder scan: no deferred implementation placeholders are used; each task names exact files, failure modes, commands, and expected outcomes.
- Type consistency: all surfaces use `GiftMemberRole = "owner" | "viewer" | "editor"`, `baseVersion`, and `gift_album_version_conflict`; management actions are `delete_album`, `remove_member`, and `change_member_role`.
