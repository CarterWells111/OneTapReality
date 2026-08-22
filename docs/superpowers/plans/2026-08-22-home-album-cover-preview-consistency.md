# Home Album Cover Preview Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each home-screen album cover render the saved first page with the same proportional text, image, wrapping, and clipping behavior as the full page and page preview.

**Architecture:** Add focused pure helpers for the canonical canvas page width and thumbnail content scale. The full reader, editor, page manager, and home cover will share the canonical width calculation; the two thumbnail surfaces will additionally pass the shared content scale into the existing `CanvasPage` rendering pipeline.

**Tech Stack:** TypeScript, React Native, Expo Router, Jest, React Native Testing Library.

---

### Task 1: Define and test shared canvas display metrics

**Files:**
- Create: `src/features/canvas/canvas-display-metrics.ts`
- Create: `__tests__/canvas-display-metrics.test.ts`

- [ ] **Step 1: Write the failing unit tests**

```ts
import {
  resolveCanvasPageWidth,
  resolveCanvasPreviewContentScale,
} from "../src/features/canvas/canvas-display-metrics";

describe("canvas display metrics", () => {
  it.each([
    [250, 280],
    [390, 350],
    [500, 360],
  ])("resolves viewport width %s to canonical page width %s", (viewportWidth, expected) => {
    expect(resolveCanvasPageWidth(viewportWidth)).toBe(expected);
  });

  it("scales thumbnail content against the canonical page width", () => {
    expect(resolveCanvasPreviewContentScale(175, 390)).toBe(0.5);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "uses a safe scale for invalid display width %s",
    (displayWidth) => {
      expect(resolveCanvasPreviewContentScale(displayWidth, 390)).toBe(1);
    },
  );
});
```

- [ ] **Step 2: Run the new unit test and verify RED**

Run: `npm test -- --runInBand __tests__/canvas-display-metrics.test.ts`

Expected: FAIL because `canvas-display-metrics` does not exist.

- [ ] **Step 3: Implement the smallest pure helpers**

```ts
const CANVAS_HORIZONTAL_INSET = 40;
const MIN_CANVAS_PAGE_WIDTH = 280;
const MAX_CANVAS_PAGE_WIDTH = 360;

export function resolveCanvasPageWidth(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth)) return MIN_CANVAS_PAGE_WIDTH;
  return Math.min(
    Math.max(viewportWidth - CANVAS_HORIZONTAL_INSET, MIN_CANVAS_PAGE_WIDTH),
    MAX_CANVAS_PAGE_WIDTH,
  );
}

export function resolveCanvasPreviewContentScale(
  displayWidth: number,
  viewportWidth: number,
): number {
  if (!Number.isFinite(displayWidth) || displayWidth <= 0) return 1;
  return displayWidth / resolveCanvasPageWidth(viewportWidth);
}
```

- [ ] **Step 4: Run the unit test and verify GREEN**

Run: `npm test -- --runInBand __tests__/canvas-display-metrics.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the shared metrics**

```bash
git add src/features/canvas/canvas-display-metrics.ts __tests__/canvas-display-metrics.test.ts
git commit -m "refactor: share canvas preview metrics"
```

### Task 2: Make actual pages and page previews consume the shared relationship

**Files:**
- Modify: `src/features/canvas/book-canvas-editor.tsx:216-218`
- Modify: `src/features/canvas/page-reader.tsx:95-97`
- Modify: `src/features/canvas/page-manager-sheet.tsx:65-74`
- Verify: `__tests__/canvas-display-metrics.test.ts`
- Verify: `__tests__/page-manager-sheet.test.tsx`

- [ ] **Step 1: Run the focused existing tests as the behavioral baseline**

Run: `npm test -- --runInBand __tests__/page-manager-sheet.test.tsx __tests__/book-canvas-editor.test.tsx __tests__/page-reader-buffer.test.tsx`

Expected: PASS before the behavior-preserving refactor.

- [ ] **Step 2: Replace duplicated width and scale formulas with the helpers**

In the reader and editor, import `resolveCanvasPageWidth` and replace their inline formula:

```ts
const pageWidth = resolveCanvasPageWidth(windowWidth);
```

Use `width` instead of `windowWidth` in `PageReader`.

In `PageManagerSheet`, import `resolveCanvasPreviewContentScale`, delete the inline `editorPageWidth` calculation, and replace its use with:

```ts
const contentScale = resolveCanvasPreviewContentScale(cellWidth, width);
```

Do not change `cellWidth`, `thumbHeight`, layout, or interaction code.

- [ ] **Step 3: Run the focused tests after refactoring**

Run: `npm test -- --runInBand __tests__/canvas-display-metrics.test.ts __tests__/page-manager-sheet.test.tsx __tests__/book-canvas-editor.test.tsx __tests__/page-reader-buffer.test.tsx`

Expected: PASS with the existing page dimensions and page-preview behavior unchanged.

- [ ] **Step 4: Commit the shared consumers**

```bash
git add src/features/canvas/book-canvas-editor.tsx src/features/canvas/page-reader.tsx src/features/canvas/page-manager-sheet.tsx
git commit -m "refactor: unify canvas display sizing"
```

### Task 3: Pass the correct content scale from the home album cover

**Files:**
- Modify: `__tests__/memory-book-cover-canvas.test.tsx`
- Modify: `src/components/memory-book-cover.tsx:1-60`

- [ ] **Step 1: Write the failing home-cover regression test**

Update the mocked `CanvasPage` prop type so it records `contentScale`, import `fireEvent`, and mock the already unit-tested scale helper with a deterministic return value:

```ts
const mockCanvasPage = jest.fn(({
  contentScale,
  layout,
}: {
  contentScale?: number;
  layout: unknown;
}) => {
  const React = require("react");
  const { Text } = require("react-native");
  return <Text testID="cover-canvas">{JSON.stringify({ contentScale, layout })}</Text>;
});

const mockResolveCanvasPreviewContentScale = jest.fn(() => 0.5);

jest.mock("../src/features/canvas/canvas-display-metrics", () => ({
  resolveCanvasPreviewContentScale: (...args: [number, number]) =>
    mockResolveCanvasPreviewContentScale(...args),
}));
```

After rendering, resize the existing pressable to a deterministic width and assert the shared relationship:

```ts
const coverButton = screen.getByRole("button", { name: "打开旅行册 顶层旧标题" });
fireEvent(coverButton, "layout", { nativeEvent: { layout: { width: 175 } } });

expect(mockResolveCanvasPreviewContentScale).toHaveBeenLastCalledWith(175, expect.any(Number));
expect(mockCanvasPage).toHaveBeenLastCalledWith(expect.objectContaining({
  contentScale: 0.5,
  height: (175 * 4) / 3,
  interactive: false,
  layout: firstPageLayout,
  width: 175,
}));
```

- [ ] **Step 2: Run the home-cover test and verify RED**

Run: `npm test -- --runInBand __tests__/memory-book-cover-canvas.test.tsx`

Expected: FAIL because the `CanvasPage` call has no `contentScale`.

- [ ] **Step 3: Implement the minimal home-cover fix**

Import `useWindowDimensions` and the shared helper, then calculate the scale from the measured cover width:

```ts
const { width: windowWidth } = useWindowDimensions();
const contentScale = resolveCanvasPreviewContentScale(coverWidth, windowWidth);
```

Pass it to the existing canvas without changing any outer styles or interactions:

```tsx
<CanvasPage
  contentScale={contentScale}
  height={(coverWidth * 4) / 3}
  interactive={false}
  layout={firstPageLayout}
  pageSide="right"
  width={coverWidth}
/>
```

- [ ] **Step 4: Run the regression tests and verify GREEN**

Run: `npm test -- --runInBand __tests__/memory-book-cover-canvas.test.tsx __tests__/canvas-display-metrics.test.ts __tests__/page-manager-sheet.test.tsx`

Expected: PASS. The recorded home-cover `contentScale` is the deterministic mocked value `0.5` after the cover width becomes 175 points.

- [ ] **Step 5: Commit the home-cover fix**

```bash
git add src/components/memory-book-cover.tsx __tests__/memory-book-cover-canvas.test.tsx
git commit -m "fix: align home album cover preview"
```

### Task 4: Verify the complete branch

**Files:**
- Verify only; modify production files only if a failing check exposes a defect in this scope.

- [ ] **Step 1: Run lint**

Run: `npm run lint`

Expected: exit code 0.

- [ ] **Step 2: Run type checking**

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 3: Run the complete test suite**

Run: `npm run test:ci`

Expected: all Jest and Node tests pass.

- [ ] **Step 4: Run the server build**

Run: `npm run build:server`

Expected: Expo web/server export completes successfully.

- [ ] **Step 5: Check branch cleanliness and review the change**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors and no uncommitted files. Review from `f4f27ab` through `HEAD` against the approved design. Do not push, merge, or create a pull request.
