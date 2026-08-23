# Canvas Preview, Edit, and Save Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make page-manager thumbnails match the opened canvas, make save actions commit every latest valid text/style/geometry edit, and make save-and-exit reopen the last operated page.

**Architecture:** Keep `BookCanvasEditor` controlled and repository-agnostic, but add a narrow imperative save-boundary handle that returns one stable `{ pages, cursor }` snapshot. Keep continuous style and transform previews off the React write path, then merge their final valid values exactly once during `prepareSave()`. Render page-manager thumbnails through the existing `CanvasPage`/`CanvasElement` path with an explicit content scale and a non-consuming selection overlay.

**Tech Stack:** Expo Router, React Native, React `forwardRef`/`useImperativeHandle`, Reanimated shared values, React Native Gesture Handler, Jest, React Native Testing Library.

---

## File structure

- Create `src/features/canvas/editor-save-transaction.ts`: pure save-snapshot merging, stable cursor resolution, and the transform-settle gate.
- Modify `src/features/canvas/canvas-page.tsx`: accept and forward thumbnail content scale without changing persisted geometry.
- Modify `src/features/canvas/canvas-element.tsx`: scale text metrics and clipping radii together with thumbnail geometry.
- Modify `src/features/canvas/page-manager-sheet.tsx`: calculate the preview scale and draw selection state as an overlay.
- Modify `src/components/ColorPicker.tsx`: report complete typed color drafts without committing every gesture frame.
- Modify `src/features/canvas/element-context-menu.tsx`: report complete font-size/color drafts to the editor.
- Modify `src/features/canvas/book-canvas-editor.tsx`: own synchronous latest pages/cursor refs and expose the save-boundary handle.
- Modify `src/app/memory/[id]/edit.tsx`: persist the prepared snapshot and allow save taps while the keyboard is open.
- Modify focused tests under `__tests__/`: prove each regression before implementation.
- Modify `docs/DECISIONS.md`: record the save-boundary and thumbnail-rendering invariant after code is green.

### Task 0: Sync the remote base and create the implementation branch

**Files:**
- Preserve: all current untracked user files.
- Carry forward: `docs/superpowers/specs/2026-08-20-canvas-preview-edit-save-consistency-design.md`
- Carry forward: `docs/superpowers/plans/2026-08-20-canvas-preview-edit-save-consistency.md`

- [ ] **Step 1: Re-check the working tree and document paths**

Run:

```powershell
git status --short --branch
git status --short -- docs/superpowers/specs/2026-08-20-canvas-preview-edit-save-consistency-design.md docs/superpowers/plans/2026-08-20-canvas-preview-edit-save-consistency.md
```

Expected: the existing unrelated untracked files remain untouched, and only the two new design/plan files are in this task's document scope.

- [ ] **Step 2: Fetch the latest remote main without rewriting the divergent local main**

The local `main` currently has user-owned divergence, so do not reset, rebase, or merge it. Run:

```powershell
git fetch origin main
git log -1 --oneline origin/main
```

Expected: fetch succeeds and prints the current remote `main` tip.

- [ ] **Step 3: Verify the new document paths do not collide with remote files**

Run:

```powershell
git ls-tree -r --name-only origin/main -- docs/superpowers/specs/2026-08-20-canvas-preview-edit-save-consistency-design.md docs/superpowers/plans/2026-08-20-canvas-preview-edit-save-consistency.md
```

Expected: no output. If either exact path exists remotely, compare it before switching and preserve both versions without overwriting.

- [ ] **Step 4: Create the feature branch directly from the fetched remote tip**

Run:

```powershell
git switch -c codex/canvas-preview-save-consistency origin/main
git status --short --branch
```

Expected: current branch is `codex/canvas-preview-save-consistency`, based on `origin/main`; all unrelated untracked files remain present.

- [ ] **Step 5: Commit the approved design and plan on the new branch**

```powershell
git add -- docs/superpowers/specs/2026-08-20-canvas-preview-edit-save-consistency-design.md docs/superpowers/plans/2026-08-20-canvas-preview-edit-save-consistency.md
git commit -m "docs: plan canvas preview and save consistency"
```

Expected: one documentation-only commit; no source files or unrelated untracked files are included.

### Task 1: Make page-manager thumbnails proportionally faithful

**Files:**
- Modify: `__tests__/canvas-page.test.tsx`
- Modify: `__tests__/page-manager-sheet.test.tsx`
- Modify: `src/features/canvas/canvas-page.tsx:14-135`
- Modify: `src/features/canvas/canvas-element.tsx:30-560`
- Modify: `src/features/canvas/page-manager-sheet.tsx:12-310`

- [ ] **Step 1: Write the failing CanvasPage metric-scaling test**

Add a focused case to `__tests__/canvas-page.test.tsx`:

```tsx
it("scales text metrics with a read-only thumbnail while preserving normalized geometry", () => {
  const screen = render(
    <CanvasPage contentScale={0.5} interactive={false} layout={layout} width={150} height={200} />,
  );

  expect(StyleSheet.flatten(screen.getByTestId("canvas-element-frame-caption-1").props.style)).toMatchObject({
    height: 20,
    left: 15,
    top: 130,
    width: 120,
  });
  expect(StyleSheet.flatten(screen.getByText("Lake side").props.style)).toMatchObject({
    fontSize: 8,
    lineHeight: 10,
    paddingHorizontal: 2,
    paddingVertical: 1,
  });
});
```

- [ ] **Step 2: Write the failing page-manager border/scale test**

Add a case to `__tests__/page-manager-sheet.test.tsx` that selects the first page, inspects its real `CanvasPage`, and proves the state border is an overlay:

```tsx
it("renders page state as an overlay without shrinking the thumbnail canvas", () => {
  const screen = render(
    <PageManagerSheet onChange={() => undefined} onClose={() => undefined} pages={pages} />,
  );

  const firstCanvasBefore = StyleSheet.flatten(screen.getAllByTestId("album-canvas")[0].props.style);
  fireEvent.press(screen.getByLabelText("第 1 页"));
  const stateOverlay = screen.getByTestId("page-thumbnail-state-a");

  expect(stateOverlay.props.pointerEvents).toBe("none");
  expect(StyleSheet.flatten(stateOverlay.props.style)).toMatchObject({
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  });
  expect(StyleSheet.flatten(screen.getAllByTestId("album-canvas")[0].props.style)).toMatchObject({
    height: firstCanvasBefore.height,
    width: firstCanvasBefore.width,
  });
});
```

Import `StyleSheet` in this test.

- [ ] **Step 3: Run the tests and verify RED**

Run:

```powershell
npx jest --runInBand --runTestsByPath __tests__/canvas-page.test.tsx __tests__/page-manager-sheet.test.tsx
```

Expected: FAIL because `CanvasPage` has no `contentScale`, text remains 16/20 pixels, and `page-thumbnail-state-a` does not exist.

- [ ] **Step 4: Add the content-scale path to CanvasPage and CanvasElement**

In `src/features/canvas/canvas-page.tsx`, add the prop and sanitize it once:

```tsx
type CanvasPageProps = {
  contentScale?: number;
  // existing props remain unchanged
};

const safeContentScale = Number.isFinite(contentScale) && (contentScale ?? 0) > 0
  ? contentScale as number
  : 1;
```

Pass `safeContentScale` to every `CanvasElement`. Scale only display metrics, never `layout` values:

```tsx
<CanvasElement
  canvasHeight={canvasHeight}
  canvasWidth={canvasWidth}
  contentScale={safeContentScale}
  element={element}
  // existing props
/>
```

In `src/features/canvas/canvas-element.tsx`, thread `contentScale` through `CanvasElement`, `ElementContent`, and `AnimatedText`. Replace the fixed text padding with a dynamic style and calculate all text metrics from the same factor:

```tsx
const scaledTextBoxStyle = {
  borderRadius: 8 * contentScale,
};

const animatedTextStyle = useAnimatedStyle(() => {
  const resolvedFontSize = previewFontSize?.value ?? fontSize;
  const scaledFontSize = resolvedFontSize * (fontScale?.value ?? 1) * contentScale;
  return {
    color: previewColor?.value ?? color,
    fontSize: scaledFontSize,
    lineHeight: Math.round(scaledFontSize * 1.28),
    paddingHorizontal: 4 * contentScale,
    paddingVertical: 2 * contentScale,
  };
});
```

Keep persisted frame geometry computed solely from `canvasWidth`, `canvasHeight`, and normalized element fields.

- [ ] **Step 5: Calculate page-manager scale and replace consuming borders**

In `src/features/canvas/page-manager-sheet.tsx`, calculate the same main-canvas width rule used by the editor, derive `contentScale`, remove the border from `thumbWrap`, and render an absolute state overlay:

```tsx
const editorPageWidth = Math.min(Math.max(width - 40, 280), 360);
const contentScale = cellWidth / editorPageWidth;

<CanvasPage
  contentScale={contentScale}
  height={thumbHeight}
  interactive={false}
  layout={page.layout}
  width={cellWidth}
/>
<View
  pointerEvents="none"
  style={[
    styles.thumbStateOverlay,
    isSelected && styles.thumbSelected,
    isHovered && styles.thumbHovered,
  ]}
  testID={`page-thumbnail-state-${page.id}`}
/>
```

Use these styles so the overlay does not consume content space:

```tsx
thumbWrap: { borderRadius: 14, overflow: "hidden", position: "relative" },
thumbStateOverlay: {
  borderColor: colors.line,
  borderRadius: 14,
  borderWidth: 2,
  bottom: 0,
  left: 0,
  position: "absolute",
  right: 0,
  top: 0,
},
thumbSelected: { borderColor: colors.accent },
thumbHovered: { borderColor: colors.warmAccent },
```

- [ ] **Step 6: Run focused tests and verify GREEN**

```powershell
npx jest --runInBand --runTestsByPath __tests__/canvas-page.test.tsx __tests__/page-manager-sheet.test.tsx
```

Expected: PASS; thumbnail text metrics scale with the frame and the state border is an overlay.

- [ ] **Step 7: Commit the rendering fix**

```powershell
git add -- __tests__/canvas-page.test.tsx __tests__/page-manager-sheet.test.tsx src/features/canvas/canvas-page.tsx src/features/canvas/canvas-element.tsx src/features/canvas/page-manager-sheet.tsx
git commit -m "fix: align canvas page thumbnails"
```

### Task 2: Surface complete style-input drafts to the editor

**Files:**
- Modify: `__tests__/color-picker.test.tsx`
- Modify: `__tests__/element-context-menu.test.tsx`
- Modify: `src/components/ColorPicker.tsx:120-465`
- Modify: `src/features/canvas/element-context-menu.tsx:26-325`

- [ ] **Step 1: Write failing typed-color draft tests**

Add to `__tests__/color-picker.test.tsx`:

```tsx
it("reports only complete typed color drafts before blur", () => {
  const onDraftChange = jest.fn();
  const screen = render(
    <ColorPicker value="#1C2C28" onCommit={() => undefined} onDraftChange={onDraftChange} />,
  );
  const input = screen.getByLabelText("十六进制颜色值");

  fireEvent.changeText(input, "#12");
  expect(onDraftChange).toHaveBeenLastCalledWith(undefined);
  fireEvent.changeText(input, "#123456");
  expect(onDraftChange).toHaveBeenLastCalledWith("#123456");
});
```

Add a second case that edits RGB drafts and expects a color only when all three channels are non-empty finite integers in `0...255`.

- [ ] **Step 2: Write the failing font-size draft propagation test**

Add to `__tests__/element-context-menu.test.tsx`:

```tsx
it("reports a complete font-size draft before blur without committing it", () => {
  const onFontSizeDraftChange = jest.fn();
  const onChangeSize = jest.fn();
  const screen = render(
    <ElementContextMenu
      element={textElement}
      elementFrame={{ x: 20, y: 80, width: 120, height: 60 }}
      initialMode="size"
      onChangeColor={() => undefined}
      onChangeFont={() => undefined}
      onChangeSize={onChangeSize}
      onClose={() => undefined}
      onFontSizeDraftChange={onFontSizeDraftChange}
      visible
    />,
  );

  fireEvent.changeText(screen.getByLabelText("输入字号"), "28");
  expect(onFontSizeDraftChange).toHaveBeenLastCalledWith(28);
  expect(onChangeSize).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run the tests and verify RED**

```powershell
npx jest --runInBand --runTestsByPath __tests__/color-picker.test.tsx __tests__/element-context-menu.test.tsx
```

Expected: FAIL because the draft callback props do not exist.

- [ ] **Step 4: Implement complete-draft reporting without changing commit timing**

Add to `ColorPickerProps`:

```tsx
onDraftChange?: (hex: string | undefined) => void;
```

Keep a latest callback ref. For HEX input, report `undefined` until the value is complete; for RGB, build the next draft object before state update and report only when every channel is non-empty and within range:

```tsx
const emitDraft = React.useCallback((hex: string | undefined) => {
  draftChangeRef.current?.(hex && VALID_HEX.test(hex) ? normalizeHex(hex) : undefined);
}, []);

const resolveRgbDraft = (draft: Record<keyof RGB, string>) => {
  const r = Number(draft.r);
  const g = Number(draft.g);
  const b = Number(draft.b);
  const complete = (["r", "g", "b"] as const).every((key) => (
    draft[key].trim() !== ""
    && Number.isInteger(Number(draft[key]))
    && Number(draft[key]) >= 0
    && Number(draft[key]) <= 255
  ));
  return complete ? rgbToHex({ r, g, b }) : undefined;
};
```

Do not call `onCommit` from `onChangeText`; existing blur/submit/gesture-finalize semantics remain unchanged.

Add to `ElementContextMenuProps`:

```tsx
onColorDraftChange?: (color: string | undefined) => void;
onFontSizeDraftChange?: (fontSize: number | undefined) => void;
```

Pass the color callback to `ColorPicker`. Add `onDraftChange` to `FontSizeSlider`; from its `onChangeText`, report a number only when the complete string parses inside `FONT_SIZE_MIN...FONT_SIZE_MAX`, otherwise report `undefined`.

- [ ] **Step 5: Run focused tests and verify GREEN**

```powershell
npx jest --runInBand --runTestsByPath __tests__/color-picker.test.tsx __tests__/element-context-menu.test.tsx
```

Expected: PASS; complete drafts are visible to the editor before blur, while `onCommit` still fires only at existing transaction boundaries.

- [ ] **Step 6: Commit the draft contract**

```powershell
git add -- __tests__/color-picker.test.tsx __tests__/element-context-menu.test.tsx src/components/ColorPicker.tsx src/features/canvas/element-context-menu.tsx
git commit -m "fix: expose pending canvas style drafts"
```

### Task 3: Build the deterministic save-snapshot primitive

**Files:**
- Create: `src/features/canvas/editor-save-transaction.ts`
- Create: `__tests__/editor-save-transaction.test.ts`

- [ ] **Step 1: Write failing snapshot and settle-gate tests**

Create `__tests__/editor-save-transaction.test.ts` with these cases:

```ts
import {
  createEditorSaveSnapshot,
  createTransformSettleGate,
} from "../src/features/canvas/editor-save-transaction";
import { canvasPages } from "../src/features/canvas/editor-pages";

it("merges one valid pending text-style patch and resolves the active page by id", () => {
  const pages = canvasPages([
    { id: "p1", position: 0, kind: "cover", headline: "One", body: "" },
    { id: "p2", position: 1, kind: "photo", headline: "Two", body: "" },
  ]);
  const target = pages[1].layout!.elements.find((element) => element.type === "text")!;

  const snapshot = createEditorSaveSnapshot({
    activePageId: "p2",
    fallbackIndex: 0,
    pages,
    styleDraft: { color: "#123456", elementId: target.id, fontSize: 28, pageId: "p2" },
  });

  expect(snapshot.cursor).toEqual({ pageId: "p2", index: 1 });
  expect(snapshot.pages[1].layout!.elements).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: target.id, color: "#123456", fontSize: 28 }),
  ]));
});

it("clamps the fallback cursor when the active page was deleted", () => {
  const pages = canvasPages([
    { id: "p1", position: 0, kind: "cover", headline: "One", body: "" },
  ]);
  expect(createEditorSaveSnapshot({ activePageId: "deleted", fallbackIndex: 9, pages }).cursor)
    .toEqual({ pageId: "p1", index: 0 });
});

it("waits for the final transform and times out without returning a false settled state", async () => {
  jest.useFakeTimers();
  const gate = createTransformSettleGate(1_000);
  gate.begin();
  const settled = gate.wait();
  gate.end();
  await expect(settled).resolves.toBe(true);

  gate.begin();
  const timedOut = gate.wait();
  jest.advanceTimersByTime(1_000);
  await expect(timedOut).resolves.toBe(false);
  jest.useRealTimers();
});
```

- [ ] **Step 2: Run the test and verify RED**

```powershell
npx jest --runInBand --runTestsByPath __tests__/editor-save-transaction.test.ts
```

Expected: FAIL because `editor-save-transaction.ts` does not exist.

- [ ] **Step 3: Implement the snapshot primitive and settle gate**

Create `src/features/canvas/editor-save-transaction.ts`:

```ts
import { updateCanvasElement } from "./editor-pages";
import type { StoryPage } from "../../types/memory";

export type CanvasEditorCursor = { pageId: string; index: number };
export type CanvasTextStyleDraft = {
  pageId: string;
  elementId: string;
  color?: string;
  fontSize?: number;
};
export type CanvasEditorSaveSnapshot = {
  pages: StoryPage[];
  cursor: CanvasEditorCursor;
};

export function createEditorSaveSnapshot({
  activePageId,
  fallbackIndex,
  pages,
  styleDraft,
}: {
  activePageId?: string;
  fallbackIndex: number;
  pages: StoryPage[];
  styleDraft?: CanvasTextStyleDraft;
}): CanvasEditorSaveSnapshot {
  const nextPages = styleDraft
    ? updateCanvasElement(pages, styleDraft.pageId, styleDraft.elementId, {
        ...(styleDraft.color ? { color: styleDraft.color } : {}),
        ...(styleDraft.fontSize !== undefined ? { fontSize: styleDraft.fontSize } : {}),
      })
    : pages;
  const idIndex = activePageId ? nextPages.findIndex((page) => page.id === activePageId) : -1;
  const index = idIndex >= 0
    ? idIndex
    : Math.max(0, Math.min(fallbackIndex, Math.max(0, nextPages.length - 1)));
  const pageId = nextPages[index]?.id ?? "";
  return { cursor: { pageId, index }, pages: nextPages };
}

export function createTransformSettleGate(timeoutMs = 1_000) {
  let activeCount = 0;
  const waiters = new Set<(settled: boolean) => void>();
  const resolveAll = (settled: boolean) => {
    const current = [...waiters];
    waiters.clear();
    current.forEach((resolve) => resolve(settled));
  };
  return {
    begin() {
      activeCount += 1;
    },
    end() {
      activeCount = Math.max(0, activeCount - 1);
      if (activeCount === 0) resolveAll(true);
    },
    isPending() {
      return activeCount > 0;
    },
    wait() {
      if (activeCount === 0) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        let timer: ReturnType<typeof setTimeout>;
        const finish = (settled: boolean) => {
          clearTimeout(timer);
          waiters.delete(finish);
          resolve(settled);
        };
        waiters.add(finish);
        timer = setTimeout(() => finish(false), timeoutMs);
      });
    },
  };
}
```

The caller validates color/font-size before constructing `styleDraft`; this module only merges an already valid draft.

- [ ] **Step 4: Run the test and verify GREEN**

```powershell
npx jest --runInBand --runTestsByPath __tests__/editor-save-transaction.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the save primitive**

```powershell
git add -- __tests__/editor-save-transaction.test.ts src/features/canvas/editor-save-transaction.ts
git commit -m "feat: add canvas save snapshot transaction"
```

### Task 4: Expose BookCanvasEditor.prepareSave()

**Files:**
- Modify: `__tests__/book-canvas-editor.test.tsx`
- Modify: `src/features/canvas/book-canvas-editor.tsx:56-760`

- [ ] **Step 1: Write the failing combined-edit snapshot test**

Add a ref-aware harness in `__tests__/book-canvas-editor.test.tsx`:

```tsx
function SaveBoundaryHarness({ editorRef }: { editorRef: React.RefObject<BookCanvasEditorHandle | null> }) {
  const [currentPages, setCurrentPages] = React.useState(() => canvasPages(pages));
  return (
    <BookCanvasEditor
      ref={editorRef}
      pages={currentPages}
      onPagesChange={setCurrentPages}
    />
  );
}
```

Import `BookCanvasEditorHandle`. Add the test:

```tsx
it("prepares one snapshot containing multiline text and an open style draft", async () => {
  const editorRef = React.createRef<BookCanvasEditorHandle>();
  const screen = render(<SaveBoundaryHarness editorRef={editorRef} />);
  const headline = openStyleMenu(screen, "字号");

  act(() => {
    (mockContextMenuProps?.onFontSizeDraftChange as ((value: number) => void) | undefined)?.(28);
  });
  act(() => {
    (mockContextMenuProps?.onClose as (() => void) | undefined)?.();
  });
  fireEvent.press(headline);
  fireEvent.press(headline);
  fireEvent.press(screen.getByText("编辑"));
  fireEvent.changeText(screen.getByLabelText(editorLabel), "第一行\n第二行");

  const snapshot = await editorRef.current!.prepareSave();
  const savedText = snapshot!.pages[0].layout!.elements.find((element) => element.id === "page-1:headline");
  expect(savedText).toMatchObject({ fontSize: 28, text: "第一行\n第二行" });
});
```

Keep the style panel open in an additional case and verify `prepareSave()` consumes `stableFontSizePreview.value` without calling the normal `onChangeSize` more than once.

- [ ] **Step 2: Write the failing immediate-cursor and settle tests**

Add:

```tsx
it("prepares the page-manager jump cursor synchronously", async () => {
  const editorRef = React.createRef<BookCanvasEditorHandle>();
  const screen = render(<SaveBoundaryHarness editorRef={editorRef} />);
  fireEvent.press(screen.getByLabelText("打开页面管理"));
  fireEvent.press(screen.getAllByText("打开")[1]);

  await expect(editorRef.current!.prepareSave()).resolves.toMatchObject({
    cursor: { pageId: "page-2", index: 1 },
  });
});
```

Use the existing mocked selection handle to start a transform, call `prepareSave()`, settle the transform, and assert the promise resolves only after the committed width/height appear in the snapshot.

- [ ] **Step 3: Run the tests and verify RED**

```powershell
npx jest --runInBand --runTestsByPath __tests__/book-canvas-editor.test.tsx
```

Expected: FAIL because `BookCanvasEditorHandle`, the `ref`, and `prepareSave()` do not exist.

- [ ] **Step 4: Convert BookCanvasEditor to a ref-aware controlled component**

Export the handle and snapshot types, then wrap the existing implementation without changing call sites that do not pass a ref:

```tsx
export type BookCanvasEditorHandle = {
  prepareSave: () => Promise<CanvasEditorSaveSnapshot | null>;
  releaseSaveLock: () => void;
};

export const BookCanvasEditor = React.forwardRef<BookCanvasEditorHandle, BookCanvasEditorProps>(
  function BookCanvasEditor({
    fallbackIndex = 0,
    initialPageId,
    onActivePageChange,
    onPagesChange,
    onTransformPendingChange,
    pages,
    persistSelectedPhoto,
  }, ref) {
    // existing component body
  },
);
```

Add refs for latest pages, cursor state, menu/editing IDs, valid style drafts, save lock, and a stable settle gate. Update them synchronously in the existing event handlers.

- [ ] **Step 5: Make every accepted page mutation update the editor ref first**

Change the editor-local `changePages` to use the latest ref as the undo source and to install `nextPages` before notifying the parent:

```tsx
const changePages = React.useCallback((nextPages: StoryPage[], reason: BookEditorChangeReason) => {
  if (saveBoundaryLockedRef.current) return;
  const previousPages = pagesRef.current;
  if (reason === "structure" || reason === "transform") pushState(previousPages);
  pagesRef.current = nextPages;
  onPagesChange(nextPages, reason);
}, [onPagesChange, pushState]);
```

Build `updateElement` from `pagesRef.current`, not the render-closure `pages`, so rapid text/style callbacks cannot overwrite each other:

```tsx
const updateElement = (elementId: string, patch: CanvasElementPatch, reason: BookEditorChangeReason) => {
  const activeId = activePageIdRef.current ?? currentPage.id;
  changePages(updateCanvasElement(pagesRef.current, activeId, elementId, patch), reason);
};
```

- [ ] **Step 6: Stage valid style drafts and make any edit validate a new text element**

Wire `ElementContextMenu` draft callbacks to a `pendingStyleDraftRef` keyed by page and element. A complete draft overwrites that property; `undefined` removes only that property. Normal style commits clear the matching staged property after calling `updateElement`.

Call a shared `markPendingTextEdited(elementId)` from text changes, color/font-size/font commits, and transform commits so style-only or geometry-only edits do not leave a new text element eligible for placeholder deletion:

```tsx
const markPendingTextEdited = (elementId: string) => {
  if (pendingTextIdRef.current === elementId) {
    pendingTextIdRef.current = undefined;
    setPendingTextId(undefined);
  }
};
```

- [ ] **Step 7: Implement prepareSave and releaseSaveLock**

Track transform starts/settles through `createTransformSettleGate()`. Expose this handle:

```tsx
React.useImperativeHandle(ref, () => ({
  async prepareSave() {
    if (saveBoundaryLockedRef.current) return null;
    saveBoundaryLockedRef.current = true;
    const settled = await transformSettleGateRef.current.wait();
    if (!settled) {
      saveBoundaryLockedRef.current = false;
      return null;
    }
    const menuDraft = resolveValidOpenMenuDraft({
      editingElementId: editingElementIdRef.current,
      menuMode: menuModeRef.current,
      pages: pagesRef.current,
      staged: pendingStyleDraftRef.current,
      previewColor: stableColorPreview.value,
      previewFontSize: stableFontSizePreview.value,
    });
    const snapshot = createEditorSaveSnapshot({
      activePageId: activePageIdRef.current,
      fallbackIndex: currentIndexRef.current,
      pages: pagesRef.current,
      styleDraft: menuDraft,
    });
    pagesRef.current = snapshot.pages;
    return snapshot;
  },
  releaseSaveLock() {
    saveBoundaryLockedRef.current = false;
  },
}), [stableColorPreview, stableFontSizePreview]);
```

Implement `resolveValidOpenMenuDraft` beside the editor constants. It accepts only `/^#[0-9A-F]{6}$/i` and font sizes in `2...40`, and returns `undefined` when there is no valid staged or open preview change:

```tsx
function resolveValidOpenMenuDraft({
  editingElementId,
  menuMode,
  pages,
  previewColor,
  previewFontSize,
  staged,
}: {
  editingElementId?: string;
  menuMode: "font" | "size" | "color" | null;
  pages: StoryPage[];
  previewColor: string;
  previewFontSize: number;
  staged?: CanvasTextStyleDraft;
}): CanvasTextStyleDraft | undefined {
  if (!editingElementId || (menuMode !== "color" && menuMode !== "size")) return undefined;
  const page = pages.find((candidate) => candidate.layout?.elements.some((element) => element.id === editingElementId));
  const element = page?.layout?.elements.find((candidate) => candidate.id === editingElementId);
  if (!page || element?.type !== "text") return undefined;
  if (menuMode === "color") {
    const color = staged?.pageId === page.id && staged.elementId === element.id && staged.color
      ? staged.color.toUpperCase()
      : previewColor.toUpperCase();
    return VALID_HEX_COLOR.test(color) && color !== element.color.toUpperCase()
      ? { color, elementId: element.id, pageId: page.id }
      : undefined;
  }
  const fontSize = staged?.pageId === page.id && staged.elementId === element.id && staged.fontSize !== undefined
    ? staged.fontSize
    : previewFontSize;
  return isValidFontSize(fontSize) && fontSize !== element.fontSize
    ? { elementId: element.id, fontSize, pageId: page.id }
    : undefined;
}
```

For page-manager jumps and successful page-turn commits, set `activePageIdRef.current` and `currentIndexRef.current` before React state. Reorder/delete are resolved by stable ID inside `createEditorSaveSnapshot`.

- [ ] **Step 8: Run focused tests and verify GREEN**

```powershell
npx jest --runInBand --runTestsByPath __tests__/book-canvas-editor.test.tsx __tests__/editor-save-transaction.test.ts
```

Expected: PASS; combined drafts form one snapshot, transform settling is awaited, and the immediate page cursor is correct.

- [ ] **Step 9: Commit the editor save boundary**

```powershell
git add -- __tests__/book-canvas-editor.test.tsx src/features/canvas/book-canvas-editor.tsx
git commit -m "fix: prepare stable canvas save snapshots"
```

### Task 5: Persist the prepared snapshot and restore its page

**Files:**
- Modify: `__tests__/memory-canvas-editor.test.tsx`
- Modify: `src/app/memory/[id]/edit.tsx:20-520`

- [ ] **Step 1: Upgrade the test editor mock to expose the save handle**

In `__tests__/memory-canvas-editor.test.tsx`, change the mocked editor to `React.forwardRef` and install a ref handle that returns its module-level latest pages and cursor:

```tsx
React.useImperativeHandle(ref, () => ({
  prepareSave: async () => ({
    cursor: mockPreparedCursor,
    pages: mockPreparedPages ?? pages,
  }),
  releaseSaveLock: mockReleaseSaveLock,
}), [pages]);
```

Reset `mockPreparedPages`, `mockPreparedCursor`, and `mockReleaseSaveLock` in `beforeEach`.

- [ ] **Step 2: Write the failing open-editor save test**

Add:

```tsx
it("persists the editor-prepared pages and cursor instead of older parent refs", async () => {
  mockPreparedPages = canvasPages(legacyPages).map((page, index) => index === 0
    ? {
        ...page,
        layout: {
          ...page.layout!,
          elements: page.layout!.elements.map((element) => element.type === "text"
            ? { ...element, color: "#123456", fontSize: 28, height: 0.25, text: "第一行\n第二行" }
            : element),
        },
      }
    : page);
  mockPreparedCursor = { pageId: "closing-1", index: 1 };
  const screen = render(<EditMemoryScreen />);
  await screen.findByTestId("album-canvas");

  await act(async () => fireEvent.press(screen.getByText("保存并退出画布")));

  expect(mockUpdatePages).toHaveBeenCalledWith(memory, mockPreparedPages);
  expect(mockReplace).toHaveBeenCalledWith({
    pathname: "/memory/[id]",
    params: { id: "memory-1", pageId: "closing-1", pageIndex: "1" },
  });
});
```

Add a timeout case where `prepareSave` resolves `null`; expect no repository write/navigation, the message `正在完成编辑，请稍后重试。`, and `releaseSaveLock` to be called.

- [ ] **Step 3: Write the failing keyboard-tap behavior assertion**

Give the main edit `ScrollView` a test ID and assert:

```tsx
expect(screen.getByTestId("memory-canvas-edit-scroll").props.keyboardShouldPersistTaps).toBe("handled");
```

- [ ] **Step 4: Run the route test and verify RED**

```powershell
npx jest --runInBand --runTestsByPath __tests__/memory-canvas-editor.test.tsx
```

Expected: FAIL because the route does not hold an editor ref, persists `pagesRef.current`, and has no keyboard tap setting or prepare-timeout message.

- [ ] **Step 5: Integrate the editor ref before the formal-save lock**

Import `BookCanvasEditorHandle`, create `editorRef`, and pass it to the editor. For a new formal save, call `prepareSave()` once, then copy that exact result into parent refs/state and the recovery queue before waiting for idle:

```tsx
const editorRef = React.useRef<BookCanvasEditorHandle>(null);

const prepared = await editorRef.current?.prepareSave();
if (!prepared) {
  setSaveError("正在完成编辑，请稍后重试。");
  return;
}
const latestPages = canvasPages(prepared.pages);
const cursor = prepared.cursor;
pagesRef.current = latestPages;
activePageRef.current = cursor;
setPages(latestPages);
setActivePage(cursor);
recoveryQueue?.enqueue(latestPages);
await recoveryQueue?.waitForIdle();
```

Set `saveInFlightRef` and `editorCommitLockedRef` before awaiting `prepareSave()` so captured old parent callbacks remain rejected. The editor's internal save lock is independent and returns the intentional snapshot directly.

Use `latestPages` and `cursor` to create `completedFormalSave`; do not recapture `pagesRef` or `activePageRef` before `updatePages`.

- [ ] **Step 6: Release the editor lock only at safe boundaries**

Call `editorRef.current?.releaseSaveLock()` after successful in-place save. On failure before formal persistence, release it in `finally` when `completedFormalSaveRef.current` is null. If formal persistence succeeded but recovery cleanup failed, retain both locks so retry only repeats cleanup/navigation and cannot alter the already-saved snapshot.

- [ ] **Step 7: Make save taps work with an open keyboard**

Update only the main editor `ScrollView`:

```tsx
<ScrollView
  contentInsetAdjustmentBehavior="automatic"
  contentContainerStyle={styles.content}
  keyboardShouldPersistTaps="handled"
  testID="memory-canvas-edit-scroll">
```

- [ ] **Step 8: Run route/editor regression tests and verify GREEN**

```powershell
npx jest --runInBand --runTestsByPath __tests__/memory-canvas-editor.test.tsx __tests__/memory-rotation-save.test.tsx __tests__/memory-detail-canvas.test.tsx
```

Expected: PASS; repository payload and navigation use the same prepared snapshot, timeout does not write, and existing save/retry/session protections remain green.

- [ ] **Step 9: Commit the route integration**

```powershell
git add -- __tests__/memory-canvas-editor.test.tsx src/app/memory/[id]/edit.tsx
git commit -m "fix: save latest canvas edit transaction"
```

### Task 6: Record the invariant and run all delivery gates

**Files:**
- Modify: `docs/DECISIONS.md`
- Verify: all modified source and test files.

- [ ] **Step 1: Update the decision record**

Append this scoped decision to `docs/DECISIONS.md`:

```markdown
## 2026-08-20：画布预览与正式保存使用同一编辑快照

- 页面管理缩略图继续复用 `CanvasPage`/`CanvasElement`，按当前设备主画布宽度等比缩放文字与内容度量；选择边框只覆盖显示，不占用或裁切画布内容。
- “保存当前修改”和“保存并退出画布”都先向 `BookCanvasEditor` 请求一次稳定 `{ pages, cursor }` 快照；文字、换行、字号、字色、文字框几何和最后操作页必须在同一快照内。
- 保存不要求用户先关闭键盘或样式面板；无效草稿回退到最后有效值，未稳定的变换不开始正式写入。
- 保持现有本地恢复草稿、账号隔离、正式相册 schema、礼品共享、NFC 和 staging 安全规则；不新增网络请求、依赖、支付、分析、第三方服务或客户端秘密。
```

- [ ] **Step 2: Run all canvas-focused tests together**

```powershell
npx jest --runInBand --runTestsByPath __tests__/canvas-page.test.tsx __tests__/page-manager-sheet.test.tsx __tests__/color-picker.test.tsx __tests__/element-context-menu.test.tsx __tests__/editor-save-transaction.test.ts __tests__/book-canvas-editor.test.tsx __tests__/memory-canvas-editor.test.tsx __tests__/memory-rotation-save.test.tsx __tests__/memory-detail-canvas.test.tsx
```

Expected: all focused suites pass with zero failed tests.

- [ ] **Step 3: Run lint**

```powershell
npm run lint
```

Expected: exit code 0 with no lint errors.

- [ ] **Step 4: Run typecheck**

```powershell
npm run typecheck
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 5: Run the complete CI test suite**

```powershell
npm run test:ci
```

Expected: exit code 0 and zero failed test suites.

- [ ] **Step 6: Run the required server build gate**

This task changes Expo route code, so run:

```powershell
npm run build:server
```

Expected: exit code 0 and a successful Expo server export.

- [ ] **Step 7: Inspect the final diff and ensure unrelated files are excluded**

```powershell
git status --short
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
```

Expected: only the design, plan, decision, focused source, and focused test files from this plan are tracked changes; unrelated user files remain untracked and untouched; `git diff --check` emits no errors.

- [ ] **Step 8: Commit the decision record and any verification-only test refinements**

```powershell
git add -- docs/DECISIONS.md
git commit -m "docs: record canvas save snapshot invariant"
```

Expected: the branch ends with focused commits and a clean tracked worktree. Do not push unless the user separately requests it.
