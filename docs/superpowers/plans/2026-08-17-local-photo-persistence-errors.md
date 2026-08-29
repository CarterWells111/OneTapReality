# Local Photo Persistence Errors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every newly selected local album photo before adding it to the canvas and show an alert without changing the canvas when persistence fails.

**Architecture:** Add a strict persistence entry point beside the existing best-effort migration helper. Expose an account-bound callback from `MemoriesProvider`, inject it into local `BookCanvasEditor` consumers, and keep the shared gift editor on its existing upload flow by leaving the callback optional.

**Tech Stack:** React Native, Expo ImagePicker, Expo FileSystem, Expo MediaLibrary, TypeScript, Jest, Testing Library.

---

### Task 1: Strict single-photo persistence

**Files:**
- Modify: `src/features/memories/photo-persistence.ts`
- Test: `__tests__/photo-persistence.test.ts`

- [x] **Step 1: Write the failing test**

Import `persistPhotoUriStrict`, make `FileSystem.copyAsync` reject, and assert that the strict function rejects instead of returning the original temporary URI.

- [x] **Step 2: Run test to verify it fails**

Run: `.\\node_modules\\.bin\\jest.cmd --runInBand --runTestsByPath __tests__/photo-persistence.test.ts`

Expected: FAIL because `persistPhotoUriStrict` is not exported.

- [x] **Step 3: Write minimal implementation**

Extract the existing directory creation, `ph://` resolution, destination generation, and copy into `persistPhotoUriStrict(uri, accountKey, memoryId)`. It returns the permanent URI and lets copy/permission/storage errors propagate. Keep `persistPhotoUri` as the existing best-effort wrapper that catches, warns, and returns the original URI for legacy migration.

- [x] **Step 4: Run test to verify it passes**

Run the Task 1 command and expect all photo-persistence tests to pass.

### Task 2: Editor success and failure behavior

**Files:**
- Modify: `src/features/canvas/book-canvas-editor.tsx`
- Test: `__tests__/book-canvas-editor.test.tsx`

- [x] **Step 1: Write failing tests**

Mock ImagePicker to return `file:///temporary.jpg`. Pass `persistSelectedPhoto` to the editor and assert:

- a resolved `file:///Documents/account/memory/photo.jpg` URI is added to the Canvas;
- a rejected persistence promise calls `Alert.alert("照片保存失败", ...)` and does not call `onPagesChange`;
- the same rules apply to the cover picker.

- [x] **Step 2: Run tests to verify RED**

Run: `.\\node_modules\\.bin\\jest.cmd --runInBand --runTestsByPath __tests__/book-canvas-editor.test.tsx`

Expected: FAIL because the editor does not accept or invoke `persistSelectedPhoto` and does not alert.

- [x] **Step 3: Implement the editor boundary**

Add optional prop `persistSelectedPhoto?: (uri: string) => Promise<string>`. For normal and cover selection, await it before calling `addImageToPage` or `setCanvasCoverImage`. On rejection call `Alert.alert` with the approved iCloud/permission/storage guidance and return without changing pages. If the callback is absent, retain the current raw-URI behavior for shared gift editing.

- [x] **Step 4: Run tests to verify GREEN**

Run the Task 2 command and expect all editor tests to pass.

### Task 3: Account-bound local screen wiring

**Files:**
- Modify: `src/features/memories/memories-provider.tsx`
- Modify: `src/app/memory/[id]/edit.tsx`
- Modify: `src/app/memory/review/[id].tsx`
- Test: `__tests__/memory-canvas-editor.test.tsx`
- Test: `__tests__/draft-review-screen.test.tsx`

- [x] **Step 1: Write failing wiring tests**

Mock `BookCanvasEditor` and assert the saved-memory and draft-review screens pass a persistence callback. Invoke it with a temporary URI and verify the provider-facing persistence method receives the current memory ID and URI.

- [x] **Step 2: Run tests to verify RED**

Run: `.\\node_modules\\.bin\\jest.cmd --runInBand --runTestsByPath __tests__/memory-canvas-editor.test.tsx __tests__/draft-review-screen.test.tsx`

Expected: FAIL because `useMemories` does not expose an immediate persistence method and the screens do not pass the callback.

- [x] **Step 3: Implement provider and screen wiring**

Expose `persistSelectedPhoto(memoryId, uri)` from `MemoriesProvider`. It obtains the verified current account key and calls `persistPhotoUriStrict(uri, accountKey, memoryId)`. Pass an ID-bound callback from both local editor screens to `BookCanvasEditor`.

- [x] **Step 4: Run tests to verify GREEN**

Run the Task 3 command and expect both suites to pass.

### Task 4: Verification

**Files:**
- Verify all modified files and tests.

- [x] **Step 1: Run focused regression tests**

Run all Task 1-3 test files plus `__tests__/memory-rotation-save.test.tsx` and expect zero failures.

- [x] **Step 2: Run repository gates**

Run `git diff --check`, `npm.cmd run lint`, `npm.cmd run typecheck`, and `npm.cmd run test:ci`. Expect exit code 0 for each. Do not run `npm run build:server` per user instruction.

- [x] **Step 3: Report without Git or remote mutation**

Summarize behavior, files, RED/GREEN evidence, and verification counts. Do not stage, commit, push, deploy, or modify any remote resource.
