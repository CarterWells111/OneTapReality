# Canvas Temporary Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a formal in-place save while preserving saved image geometry.

**Architecture:** Parameterize the existing formal save boundary by whether it should leave the route. Keep persistence and recovery cleanup shared, then reset only the completed transaction state for in-place saves. Verify geometry using the same persisted page snapshot passed to the provider.

**Tech Stack:** Expo Router, React Native, TypeScript, Jest.

---

### Task 1: Specify temporary-save behavior

**Files:**
- Modify: `__tests__/memory-canvas-editor.test.tsx`

- [ ] **Step 1: Write a failing test**

```tsx
await act(async () => fireEvent.press(screen.getByText("保存当前修改")));
expect(mockUpdatePages).toHaveBeenCalledTimes(1);
expect(mockDismissTo).not.toHaveBeenCalled();
expect(screen.getByTestId("album-canvas")).toBeTruthy();
```

- [ ] **Step 2: Run the focused test and verify it fails because the button is absent.**

- [ ] **Step 3: Add `save({ navigate: false })` and render the button above `保存并退出画布`. On success, clear the completed transaction lock while retaining pages and cursor.**

- [ ] **Step 4: Re-run the focused test and verify it passes.**

### Task 2: Lock the geometry round-trip invariant

**Files:**
- Modify: `__tests__/memory-canvas-editor.test.tsx`
- Modify: `src/app/memory/[id]/edit.tsx`

- [ ] **Step 1: Write a failing test with an image element whose `x`, `y`, `width`, `height`, and `rotation` are non-default, then temporarily save and assert the next editor snapshot exactly matches it.**

- [ ] **Step 2: Run the focused test and verify it exposes any stale-session reset.**

- [ ] **Step 3: Ensure a successful in-place save updates the editor's session baseline from the submitted snapshot rather than resetting from an older provider value.**

- [ ] **Step 4: Re-run focused canvas editor tests and verify they pass.**

### Task 3: Validate the save boundary

**Files:**
- Modify: `__tests__/memory-canvas-editor.test.tsx`
- Modify: `__tests__/memory-rotation-save.test.tsx` if its router mock needs the new action.

- [ ] **Step 1: Confirm final save still calls `dismissTo` once and temporary save does not call it.**

- [ ] **Step 2: Run lint, typecheck, test:ci, and build:server.**
