# Album Save Page Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a successful local save or shared publication, open the full album preview on the page that was active in the editor.

**Architecture:** `BookCanvasEditor` reports a stable `{ pageId, index }` cursor. Save owners retain that cursor until persistence succeeds, then pass it to a controlled `PageReader`; shared reload preserves the cursor while refreshing server data. `PageReader` resolves by page ID first and clamps the fallback index when the target was deleted.

**Tech Stack:** React Native, Expo Router, TypeScript, Jest, React Native Testing Library.

---

### Task 1: Controlled editor and reader cursor

**Files:**
- Modify: `src/features/canvas/book-canvas-editor.tsx`
- Modify: `src/features/canvas/page-reader.tsx`
- Test: `__tests__/book-canvas-editor.test.tsx`
- Test: `__tests__/page-reader-buffer.test.tsx`

- [ ] **Step 1: Write failing cursor tests**

Add a test that turns or jumps the editor to page `p2` and expects `onActivePageChange({ pageId: "p2", index: 1 })`. Add reader tests that render `initialPageId="p2"` and expect page 2, then rerender without `p2` and expect a clamped fallback index.

- [ ] **Step 2: Verify RED**

Run:
`npm.cmd exec -- jest --runInBand --runTestsByPath __tests__/book-canvas-editor.test.tsx __tests__/page-reader-buffer.test.tsx`

Expected: FAIL because `onActivePageChange`, `initialPageId`, and `fallbackIndex` are not supported.

- [ ] **Step 3: Implement the cursor contract**

Extend editor props with:

```ts
onActivePageChange?: (cursor: { pageId: string; index: number }) => void;
```

Call it whenever the effective current page changes. Extend reader props with:

```ts
type PageReaderProps = {
  pages: StoryPage[];
  initialPageId?: string;
  fallbackIndex?: number;
};
```

Resolve the initial/current index by exact ID, otherwise clamp `fallbackIndex ?? 0` to `[0, pages.length - 1]`. Do not reset user-driven reader navigation unless either restoration prop changes.

- [ ] **Step 4: Verify GREEN**

Run the Task 1 Jest command and expect both suites to pass.

### Task 2: Restore local album page after save

**Files:**
- Modify: `src/app/memory/[id]/edit.tsx`
- Modify: `src/app/memory/[id].tsx`
- Test: `__tests__/memory-canvas-editor.test.tsx`
- Test: `__tests__/memory-detail-canvas.test.tsx`

- [ ] **Step 1: Write failing local save tests**

Mock the editor reporting `{ pageId: "page-2", index: 1 }`. After pressing save, assert `updatePages` resolves before navigation and navigation replaces the detail route with:

```ts
{
  pathname: "/memory/[id]",
  params: { id: "memory-canvas", pageId: "page-2", pageIndex: "1" },
}
```

On the detail screen, assert those search params are passed to `PageReader`. Add a rejected save case asserting no navigation.

- [ ] **Step 2: Verify RED**

Run:
`npm.cmd exec -- jest --runInBand --runTestsByPath __tests__/memory-canvas-editor.test.tsx __tests__/memory-detail-canvas.test.tsx`

Expected: FAIL because local save calls `router.back()` and detail ignores restoration params.

- [ ] **Step 3: Implement local routing**

Keep the latest editor cursor in a ref/state. After `updatePages` succeeds, call `router.replace` with `pageId` and decimal `pageIndex`. Parse `pageIndex` defensively in the detail screen and pass both values to `PageReader`. Leave the editor mounted and do not navigate when persistence rejects.

- [ ] **Step 4: Verify GREEN**

Run the Task 2 Jest command and expect both suites to pass.

### Task 3: Restore shared album page after publish

**Files:**
- Modify: `src/features/gifts/shared-album-editor.tsx`
- Modify: `src/app/gifts/shared/[id].tsx`
- Test: `__tests__/gift-shared-editor.test.tsx`
- Test: `__tests__/gift-shared-viewer.test.tsx`

- [ ] **Step 1: Write failing shared publication tests**

Have the editor mock report `{ pageId: "p2", index: 1 }`; assert successful `onPublished` receives that cursor. In the shared screen, resolve the refreshed album with `p2`, then assert editing closes, `opened` remains true, and `PageReader` receives `initialPageId="p2"` and `fallbackIndex={1}`. Assert publication failure does not call `onPublished`.

- [ ] **Step 2: Verify RED**

Run:
`npm.cmd exec -- jest --runInBand --runTestsByPath __tests__/gift-shared-editor.test.tsx __tests__/gift-shared-viewer.test.tsx`

Expected: FAIL because publication callbacks carry no cursor and `load()` resets the screen to the cover.

- [ ] **Step 3: Implement cursor-preserving shared reload**

Change `onPublished` to accept the cursor. Add a load option that preserves/open the reader only for successful publication, while initial load, retry, 403, context switch, and stale reload retain their existing reset behavior. After the refreshed album commits, render `PageReader` with the saved cursor. Keep owner/editor behavior identical and viewer read-only.

- [ ] **Step 4: Verify GREEN**

Run the Task 3 Jest command and expect both suites to pass.

### Task 4: Full verification

**Files:**
- Verify all modified files

- [ ] **Step 1: Run focused regression tests**

Run all six suites from Tasks 1–3 together and expect zero failures.

- [ ] **Step 2: Run repository gates**

Run:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:ci
git diff --check
```

Expected: every command exits 0. Do not run a remote build, push, PR, or deployment.
