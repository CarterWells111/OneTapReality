# Album Canvas Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace text-only travel-page editing with a locally persisted 1:1 album canvas where photos, text, and stickers can be auto-laid-out, selected, moved, scaled, rotated, and styled in Expo Go.

**Architecture:** Preserve `StoryPage` headline/body/photoUri for existing list and detail use, and add an optional `layout` containing a square `CanvasPage` and ordered `CanvasElement[]`. Store it as `story_pages.layout_json`; hydration derives a deterministic legacy layout when the column value is absent. The editor holds gesture updates in component state and calls the existing atomic page-save path only when the user saves.

**Tech Stack:** Expo Router, Expo SQLite, React Native Gesture Handler, Reanimated, expo-image, TypeScript strict mode, Jest and React Native Testing Library.

---

### Task 1: Define and normalize persistent canvas layouts

**Files:**
- Modify: `src/types/memory.ts`
- Create: `src/features/canvas/canvas-layout.ts`
- Modify: `src/storage/memory-repository.ts`
- Test: `__tests__/canvas-layout.test.ts`, `__tests__/memory-repository.test.ts`

- [ ] Write failing tests proving `createLegacyLayout(page)` produces one square page with text elements and an image element when `photoUri` exists, and that `normalizeLayout` clamps x/y/width/height to 0–1 while assigning unique element IDs.
- [ ] Run `npm.cmd run test:ci -- canvas-layout.test.ts`; expect a module-not-found failure.
- [ ] Add `CanvasElement`, `CanvasLayout`, font-style union, sticker-id union, and optional `StoryPage.layout`; implement pure legacy/normalization helpers.
- [ ] Add `layout_json TEXT` through an idempotent SQLite migration; select, parse, normalize, and serialize it in the repository.
- [ ] Run focused tests, then `npm.cmd run typecheck`; expect PASS.

### Task 2: Generate rule-based square album layouts and assets

**Files:**
- Create: `src/features/canvas/auto-layout.ts`
- Create: `src/features/canvas/canvas-assets.ts`
- Test: `__tests__/auto-layout.test.ts`

- [ ] Write failing tests for one-photo, two-photo, three-photo, and four-plus-photo layouts; each must have square-safe image bounds and non-overlapping normalized positions.
- [ ] Run `npm.cmd run test:ci -- auto-layout.test.ts`; expect a module-not-found failure.
- [ ] Implement deterministic templates for 1, 2, 3, and 4+ images; expose three system font choices and twelve offline emoji stickers.
- [ ] Run focused tests; expect PASS.

### Task 3: Build isolated canvas rendering and gesture primitives

**Files:**
- Create: `src/features/canvas/canvas-page.tsx`
- Create: `src/features/canvas/canvas-element.tsx`
- Create: `src/features/canvas/canvas-toolbar.tsx`
- Test: `__tests__/canvas-page.test.tsx`

- [ ] Write failing render tests for image, text, and sticker elements, selection outline, and tool actions that update element style/layer/delete through callbacks.
- [ ] Run `npm.cmd run test:ci -- canvas-page.test.tsx`; expect a module-not-found failure.
- [ ] Implement a responsive 1:1 canvas using `useWindowDimensions`; layer elements with relative positions. Use Gesture Detector pan/pinch/rotation simultaneously and emit the final normalized transform on gesture end.
- [ ] Implement the practical toolbar: add text, add sticker, font, color, bring forward, send backward, duplicate, and delete. Do not persist during gestures.
- [ ] Run focused tests and typecheck; expect PASS.

### Task 4: Replace text-only editing with the canvas workflow

**Files:**
- Modify: `src/app/memory/[id]/edit.tsx`
- Modify: `src/app/memory/[id].tsx`
- Modify: `src/features/memories/memories-provider.tsx`
- Test: `__tests__/memory-canvas-editor.test.tsx`

- [ ] Write failing tests showing the edit screen converts legacy pages, adds/deletes/reorders pages, and sends layouts to `updatePages` only after Save.
- [ ] Run `npm.cmd run test:ci -- memory-canvas-editor.test.tsx`; expect failure because the existing screen only has text inputs.
- [ ] Replace the screen with page thumbnail selection, central canvas, bottom toolbar, add-page action, delete-page confirmation, and a single Save action. New pages receive the deterministic auto layout from selected local photo URIs.
- [ ] Render saved layouts in the detail page with `CanvasPage` while retaining existing fallback rendering for legacy pages.
- [ ] Run focused tests; expect PASS.

### Task 5: Verify Expo Go readiness and commit in reviewed stages

**Files:**
- Modify: `docs/superpowers/plans/2026-07-22-album-canvas-editor.md`
- Modify: `docs/DECISIONS.md`

- [ ] After each task run `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run test:ci`, and `git diff --check`; stop if a change touches networking, AI SDKs, payment, NFC, WebView, or unrelated routes.
- [ ] After Tasks 1–4 run `npx.cmd expo-doctor` and `npx.cmd expo export --platform ios --output-dir .expo-export`; delete the exact temporary export directory after inspecting success.
- [ ] On an iPhone Expo Go device verify: open a legacy memory, select/add photo/text/sticker, drag, pinch, rotate, save, restart, and reopen with the same layout.
- [ ] Commit each green task separately and push the existing Draft PR branch without force push.
