# Draft Review Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route a generated travel memory through a local confirmation screen before it becomes a saved memory.

**Architecture:** `MemoriesProvider` owns all SQLite access and exposes draft commands. The create screen creates a local draft and opens `memory/review/[id]`; that page loads the draft via the Provider and can save, regenerate with the existing local generator, or mark it discarded. The saved-memory list remains backed by `listMemories`, which is already limited to `saved` records.

**Tech Stack:** Expo Router, React Native, Expo SQLite, Jest, React Native Testing Library.

---

### Task 1: Prove review-screen actions before implementation

**Files:**
- Create: `__tests__/draft-review-screen.test.tsx`
- Create: `src/app/memory/review/[id].tsx`

- [x] Write a screen test that mocks `useMemories` and verifies a loaded draft shows its title, `saveDraft(id)` is called by “保留草稿”, and the router replaces to `/memory/[id]` only after success.
- [x] Run `npm.cmd run test:ci -- draft-review-screen.test.tsx`; expect a module-not-found failure for `src/app/memory/review/[id].tsx`.
- [x] Implement the smallest screen with loading, missing-draft, action-disabled, error, save, retry, and discard states. It must use only `useMemories` and Expo Router.
- [x] Re-run the focused test; expect PASS.

### Task 2: Wire the local draft commands into the Provider and create route

**Files:**
- Modify: `src/features/memories/memories-provider.tsx`
- Modify: `src/app/memory/new.tsx`
- Modify: `src/app/_layout.tsx`
- Test: `__tests__/draft-review-screen.test.tsx`

- [x] Extend the Provider context with `createDraft`, `getDraftById`, `saveDraft`, `retryDraft`, and `discardDraft`; each method must use the existing local repository and `DemoDraftGenerator` only.
- [x] Change the creation screen to call `createDraft` and replace to `/memory/review/[id]`.
- [x] Add the review route to the root Stack with the title “确认草稿”.
- [x] Re-run focused tests and confirm a draft cannot appear in the saved-memory state before `saveDraft` succeeds.

### Task 3: Verify, document completion, and commit

**Files:**
- Modify: `docs/DECISIONS.md`
- Modify: `docs/superpowers/plans/2026-07-22-draft-review-flow.md`

- [x] Run `npm.cmd run lint`, `npm.cmd run typecheck`, and `npm.cmd run test:ci`.
- [x] Run `git diff --check` and verify no remote AI, SQL in a page, payment, analytics, or NFC dependency was added.
- [x] Mark completed plan items and commit with `feat: add draft review flow`.
