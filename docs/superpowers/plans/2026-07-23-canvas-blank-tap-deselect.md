# Canvas Blank Tap Deselection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a selected canvas component to be deselected by tapping an uncovered area inside the book page.

**Architecture:** `CanvasPage` owns the page-surface press target and exposes an optional `onPressBlank` callback. Nested interactive `CanvasElement` press targets continue to handle component presses, while `BookCanvasEditor` clears only its local `selectedElementId` when the page surface receives a press.

**Tech Stack:** React Native `Pressable`, React 19, Expo 54, Testing Library for React Native 13.3.3, Jest.

---

### Task 1: Add blank-page deselection

**Files:**
- Modify: `__tests__/book-canvas-editor.test.tsx`
- Modify: `src/features/canvas/canvas-page.tsx`
- Modify: `src/features/canvas/book-canvas-editor.tsx`

- [ ] **Step 1: Write the failing interaction test**

Add this test to `__tests__/book-canvas-editor.test.tsx`:

```tsx
it("clears component selection when the page blank area is pressed without changing pages", () => {
  const onChange = jest.fn();
  const screen = render(<EditorHarness onChange={onChange} />);
  const firstText = screen.getByText("第一页");

  fireEvent.press(firstText);
  fireEvent.press(firstText);
  expect(screen.getByText("完成")).toBeTruthy();

  fireEvent.press(screen.getByTestId("album-canvas"));

  expect(screen.queryByText("完成")).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});
```

Extend the same test, or add a focused companion assertion, to double-select the component again, press
`canvas-element-page-1:headline`, and verify that `完成` remains visible. This proves nested component presses
do not bubble into blank-page deselection.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
$env:Path = 'C:\Users\carte\AppData\Local\nvm\v24.15.0;' + $env:Path
npm.cmd run test:ci -- --runTestsByPath __tests__/book-canvas-editor.test.tsx
```

Expected: FAIL because pressing `album-canvas` does not clear the selected component.

- [ ] **Step 3: Add the minimal page-surface callback**

In `src/features/canvas/canvas-page.tsx`, import `Pressable`, add the optional prop, and use the page surface as
the press target:

```tsx
type CanvasPageProps = {
  onPressBlank?: () => void;
  // existing props
};

export function CanvasPage({
  onPressBlank,
  // existing props
}: CanvasPageProps) {
  return (
    <Pressable
      onPress={interactive ? onPressBlank : undefined}
      style={/* existing canvas styles */}
      testID="album-canvas">
      {/* existing CanvasElement children */}
    </Pressable>
  );
}
```

Do not add coordinate collision detection and do not invoke the callback from `CanvasElement`.

- [ ] **Step 4: Connect the editor selection state**

In `src/features/canvas/book-canvas-editor.tsx`, pass the local state reset to the existing `CanvasPage`:

```tsx
<CanvasPage
  onPressBlank={() => setSelectedElementId(undefined)}
  // existing props
/>
```

The callback must not call `changePages`, so deselection remains a UI-only operation and does not enqueue a save.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```powershell
$env:Path = 'C:\Users\carte\AppData\Local\nvm\v24.15.0;' + $env:Path
npm.cmd run test:ci -- --runTestsByPath __tests__/book-canvas-editor.test.tsx __tests__/canvas-page.test.tsx
```

Expected: both suites pass; blank page press hides `完成`, component press retains it, and `onPagesChange` remains untouched.

### Task 2: Verify and publish the PR update

**Files:**
- Verify all modified source, test, and documentation files.

- [ ] **Step 1: Run the project quality gates**

Run:

```powershell
$env:Path = 'C:\Users\carte\AppData\Local\nvm\v24.15.0;' + $env:Path
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:ci
```

Expected: all three commands exit with code 0 and the full Jest suite reports zero failures.

- [ ] **Step 2: Review scope**

Run:

```powershell
git status --short
git diff --check
git diff -- src/features/canvas/canvas-page.tsx src/features/canvas/book-canvas-editor.tsx __tests__/book-canvas-editor.test.tsx
```

Expected: only the approved interaction, its tests, and its design/plan documents are in scope; existing untracked
image and slide assets remain untracked.

- [ ] **Step 3: Commit the implementation**

Run:

```powershell
git add -- src/features/canvas/canvas-page.tsx src/features/canvas/book-canvas-editor.tsx __tests__/book-canvas-editor.test.tsx docs/superpowers/plans/2026-07-23-canvas-blank-tap-deselect.md
git commit -m "feat: deselect canvas elements on blank tap"
```

- [ ] **Step 4: Push the existing PR branch**

Run:

```powershell
git push origin codex/preserve-saved-canvas-transforms
```

Expected: PR #45 receives the implementation commit without a force push.
