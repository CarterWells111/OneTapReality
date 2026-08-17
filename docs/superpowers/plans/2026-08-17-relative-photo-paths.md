# Relative Local Photo Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve local album photos across iOS container-root changes by storing validated Documents-relative references and hydrating safe runtime URIs.

**Architecture:** SQLite receives only canonical `documents://photos/accounts/<account>/<memory>/<filename>` references. A provider-layer asynchronous codec converts raw storage memories into runtime memories with current absolute file URIs, or opaque missing-photo tokens with retained provenance. All photo fields are atomically rewritten through one owner-checked repository transaction.

**Tech Stack:** Expo FileSystem legacy API, Expo SQLite, React Native, TypeScript, Jest.

---

### Task 1: Canonical photo-reference codec

**Files:**
- Create: `src/features/memories/photo-references.ts`
- Test: `__tests__/photo-references.test.ts`

- [ ] **Step 1: Write the failing test**

Test a current Documents URI becoming `documents://photos/accounts/owner%40example.com/memory-1/a.jpg`, resolving it against a changed Documents root, and rejecting traversal, unexpected account/memory segments and invalid filenames. Test missing tokens are unique and never canonical.

- [ ] **Step 2: Verify RED**

Run `npm.cmd exec -- jest --runInBand --runTestsByPath __tests__/photo-references.test.ts`.

Expected: FAIL because the codec does not exist.

- [ ] **Step 3: Implement minimal helpers**

```ts
export const MISSING_LOCAL_PHOTO_PREFIX = "missing-local-photo://";
export function toCanonicalPhotoReference(uri: string, accountKey: string, memoryId: string): string | null;
export function resolveCanonicalPhotoReference(reference: string, accountKey: string, memoryId: string): string | null;
export function rebaseLegacyAccountPhotoUri(uri: string, accountKey: string, memoryId: string): string | null;
export function createMissingPhotoToken(): `missing-local-photo://${string}`;
export function isMissingPhotoToken(uri: string): boolean;
```

Require exact expected account/memory segments and generated filename grammar; never authorize by broad prefix.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command and expect all tests to pass.

### Task 2: Atomic owner-scoped media snapshot

**Files:**
- Modify: `src/storage/memory-repository.ts`
- Modify: `__tests__/memory-repository.test.ts`

- [ ] **Step 1: Write the failing test**

Test `replaceMemoryMediaSnapshot(db, memory, accountKey)` replaces `memory_photos`, cover, page photo and layout JSON together. Inject a statement failure and assert the old snapshot remains. Assert another account cannot replace any part.

- [ ] **Step 2: Verify RED**

Run `npm.cmd exec -- jest --runInBand --runTestsByPath __tests__/memory-repository.test.ts`.

Expected: FAIL because the function is absent.

- [ ] **Step 3: Implement the transaction**

```ts
export async function replaceMemoryMediaSnapshot(
  db: SQLiteDatabase,
  memory: Memory,
  accountKey: string,
): Promise<boolean>;
```

Within one `withTransactionAsync`, owner-check the memory row, update timestamp/cover, replace photos and replace full story pages. Return false for no owner row and throw on failure.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command and expect all tests to pass.

### Task 3: Strict copy and asynchronous hydration

**Files:**
- Modify: `src/features/memories/photo-persistence.ts`
- Modify: `src/features/memories/memories-provider.tsx`
- Modify: `__tests__/photo-persistence.test.ts`
- Modify: `__tests__/memories-provider-draft-pages.test.tsx`

- [ ] **Step 1: Write failing tests**

Test destination existence verification after copy, partial destination deletion on failure, and no picker-URI fallback. Test old account-scoped absolute paths rebase to a changed Documents root; test missing legacy data creates a unique missing token and retains storage provenance.

- [ ] **Step 2: Verify RED**

Run `npm.cmd exec -- jest --runInBand --runTestsByPath __tests__/photo-persistence.test.ts __tests__/memories-provider-draft-pages.test.tsx`.

Expected: FAIL because hydration result and strict verification are absent.

- [ ] **Step 3: Implement bounded hydration**

Define `PhotoHydrationResult` and `hydrateMemoryPhotoReferences(memory, accountKey)`. Process all photo, cover, page, layout image and layout cover references with at most three file operations. Resolved fields receive current absolute runtime URIs and canonical storage values; missing fields receive provider-issued tokens and provenance. Provider reads expose runtime memory only; changed results call `replaceMemoryMediaSnapshot` once with storage memory. New photo copy verifies `exists && !isDirectory` and fails closed.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command and expect all tests to pass.

### Task 4: Missing-photo rendering and action guards

**Files:**
- Modify: `src/features/canvas/canvas-element.tsx`
- Modify: `src/app/gifts/[id].tsx`
- Modify: `src/features/export/share-action-sheet.tsx`
- Test: `__tests__/canvas-element.test.tsx`
- Test: `__tests__/gift-owner-management.test.tsx`
- Test: `__tests__/print-validators.test.ts`

- [ ] **Step 1: Write failing tests**

Render a missing token and assert local placeholder without passing it to `Image`. Assert export and new gift publication reject any missing token before upload.

- [ ] **Step 2: Verify RED**

Run `npm.cmd exec -- jest --runInBand --runTestsByPath __tests__/canvas-element.test.tsx __tests__/gift-owner-management.test.tsx __tests__/print-validators.test.ts`.

Expected: FAIL because tokens are ordinary image URIs.

- [ ] **Step 3: Implement guards**

Render a labeled local placeholder for `isMissingPhotoToken`. Add a shared full-memory validator. Export and new publication report an actionable error and do not upload; an existing cloud snapshot stays unchanged.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command and expect all tests to pass.

### Task 5: Cleanup boundary and full verification

**Files:**
- Modify: `src/features/memories/photo-persistence.ts`
- Modify: `__tests__/photo-persistence.test.ts`

- [ ] **Step 1: Write the failing test**

Create two accounts referencing one pre-account `Documents/photos/...` URI and assert account A migration never deletes it. Assert permanent deletion still targets only validated account/memory directories.

- [ ] **Step 2: Verify RED**

Run `npm.cmd exec -- jest --runInBand --runTestsByPath __tests__/photo-persistence.test.ts`.

Expected: FAIL if shared-root cleanup remains reachable.

- [ ] **Step 3: Restrict cleanup**

Keep pre-account shared-root files untouched. Restrict automatic cleanup to validated account/memory directories; remove provider calls that schedule shared-root deletion.

- [ ] **Step 4: Final verification**

Run focused tests, then exactly once: `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run test:ci`, `npm.cmd run build:server`, and `git diff --check`.

Expected: all commands exit 0.
