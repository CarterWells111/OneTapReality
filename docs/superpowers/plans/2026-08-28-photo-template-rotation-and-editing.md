# Photo Template Rotation and Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store and render template rotations consistently in radians, safely repair legacy degree-valued template layouts, and expose photo/template editing on every album page across draft, local, and shared flows.

**Architecture:** `photo-templates.ts` remains the single template registry and converts author-friendly degree constants to the canvas' canonical radians. `normalizeLayout` performs a conservative all-or-nothing repair when a known template's image count, geometry, ordering, and legacy rotations match; every persisted local path already uses it, and the shared mapper will normalize after resolving media URLs. `BookCanvasEditor` owns one unconditional “照片与模板” entry, so every existing consumer inherits the same workflow.

**Tech Stack:** TypeScript, React Native, Expo Router, Jest, React Native Testing Library

---

### Task 1: Make radians the template contract

**Files:**
- Modify: `src/features/canvas/photo-templates.ts`
- Modify: `src/features/canvas/photo-template-picker.tsx`
- Modify: `src/features/memories/draft-photo-allocation.tsx`
- Test: `__tests__/photo-templates.test.ts`
- Test: `__tests__/photo-template-picker.test.tsx`
- Test: `__tests__/draft-photo-allocation.test.tsx`
- Test: `__tests__/demo-draft-generator.test.ts`

- [ ] **Step 1: Write failing registry and generated-layout assertions**

Import `degreesToRadians` in `__tests__/photo-templates.test.ts`, replace the collage rotations in the exact registry fixture with `degreesToRadians(-2.5)`, `degreesToRadians(-3)`, `degreesToRadians(3)`, and `degreesToRadians(-1.5)`, then add:

```ts
it("stores collage rotations in canvas radians", () => {
  const layout = createPhotoTemplateLayout(["one.jpg", "two.jpg"], "collage-2");
  const rotations = layout?.elements
    .filter((element) => element.type === "image")
    .map((element) => element.rotation);
  expect(rotations?.[0]).toBeCloseTo(-Math.PI / 60);
  expect(rotations?.[1]).toBeCloseTo(Math.PI / 60);
  expect(rotations?.every((rotation) => Math.abs(rotation) < 0.1)).toBe(true);
});
```

In `__tests__/demo-draft-generator.test.ts`, generate a draft with `collage-2` and assert its two image rotations are close to `±Math.PI / 60`.

- [ ] **Step 2: Write failing preview assertions**

Change the collage preview expectation in `__tests__/photo-template-picker.test.tsx` to:

```ts
expect(collageImage.props.style).toEqual(expect.arrayContaining([
  expect.objectContaining({ transform: [{ rotate: `${-Math.PI / 60}rad` }] }),
]));
```

Add the equivalent active-page collage assertion in `__tests__/draft-photo-allocation.test.tsx` so its preview must render `rad` rather than `deg`.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```powershell
npx jest __tests__/photo-templates.test.ts __tests__/photo-template-picker.test.tsx __tests__/draft-photo-allocation.test.tsx __tests__/demo-draft-generator.test.ts --runInBand
```

Expected: FAIL because `degreesToRadians` is absent and collage slots still contain `-3`/`3` degree values.

- [ ] **Step 4: Convert authoring degrees once in the registry**

Add to `photo-templates.ts`:

```ts
export const degreesToRadians = (degrees: number) => degrees * Math.PI / 180;
export const radiansToDegrees = (radians: number) => radians * 180 / Math.PI;

const slot = (
  x: number,
  y: number,
  width: number,
  height: number,
  rotationDegrees = 0,
): PhotoTemplateSlot => ({
  x,
  y,
  width,
  height,
  rotation: degreesToRadians(rotationDegrees),
});
```

Keep the fifteen template definitions readable in degrees. Change both preview components to render `rotate: `${rotation}rad``.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the command from Step 3.

Expected: all four suites PASS.

- [ ] **Step 6: Commit the unit change**

```powershell
git add src/features/canvas/photo-templates.ts src/features/canvas/photo-template-picker.tsx src/features/memories/draft-photo-allocation.tsx __tests__/photo-templates.test.ts __tests__/photo-template-picker.test.tsx __tests__/draft-photo-allocation.test.tsx __tests__/demo-draft-generator.test.ts
git commit -m "fix: use radians for photo template rotation"
```

### Task 2: Repair only exact legacy template rotations

**Files:**
- Modify: `src/features/canvas/canvas-layout.ts`
- Test: `__tests__/canvas-layout.test.ts`
- Test: `__tests__/memory-edit-draft-repository.test.ts`
- Test: `__tests__/memory-repository.test.ts`

- [ ] **Step 1: Add failing normalization tests**

Create a helper that builds the `collage-2` geometry with rotation values `[-3, 3]`. Assert:

```ts
const normalized = normalizeLayout({
  aspectRatio: 0.75,
  photoTemplateId: "collage-2",
  elements: legacyElements,
});
expect(normalized.elements[0].rotation).toBeCloseTo(-Math.PI / 60);
expect(normalized.elements[1].rotation).toBeCloseTo(Math.PI / 60);
```

Add separate tests proving already-radian template data stays unchanged, one manual rotation prevents the entire repair, mismatched geometry prevents repair, and layouts without a template ID remain unchanged.

- [ ] **Step 2: Add failing repository regression tests**

In both repository suites, persist/restore a valid `collage-2` layout with exact template geometry and legacy `-3`/`3` rotations, then assert restored rotations are radians. These tests prove saved edit drafts and formal local albums both traverse normalization.

- [ ] **Step 3: Run focused tests and verify RED**

```powershell
npx jest __tests__/canvas-layout.test.ts __tests__/memory-edit-draft-repository.test.ts __tests__/memory-repository.test.ts --runInBand
```

Expected: legacy rotations remain `-3` and `3`.

- [ ] **Step 4: Implement conservative all-or-nothing repair**

In `canvas-layout.ts`, import `radiansToDegrees` and add epsilon comparison plus an index map:

```ts
const TEMPLATE_EPSILON = 1e-6;
const approximatelyEqual = (left: number, right: number) =>
  Math.abs(left - right) <= TEMPLATE_EPSILON;

function repairedTemplateRotations(
  elements: CanvasLayout["elements"],
  template: ReturnType<typeof resolvePhotoTemplate>,
): ReadonlyMap<number, number> {
  if (!template) return new Map();
  const orderedImages = elements
    .map((element, index) => ({ element, index }))
    .filter((item): item is { element: Extract<CanvasElement, { type: "image" }>; index: number } => item.element.type === "image")
    .sort((left, right) => left.element.zIndex - right.element.zIndex || left.index - right.index);
  if (orderedImages.length !== template.photoCount) return new Map();
  const matches = orderedImages.every(({ element }, slotIndex) => {
    const slot = template.slots[slotIndex];
    return approximatelyEqual(element.x, slot.x)
      && approximatelyEqual(element.y, slot.y)
      && approximatelyEqual(element.width, slot.width)
      && approximatelyEqual(element.height, slot.height)
      && (approximatelyEqual(element.rotation, slot.rotation)
        || approximatelyEqual(element.rotation, radiansToDegrees(slot.rotation)));
  });
  if (!matches) return new Map();
  return new Map(orderedImages.map(({ index }, slotIndex) => [index, template.slots[slotIndex].rotation]));
}
```

Compute the map before `elements.map`, pass the array index into the mapper, and set only `rotation: repairs.get(index) ?? element.rotation`. This keeps manual/freeform rotations untouched and prevents partial repair.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the command from Step 3.

Expected: all suites PASS.

- [ ] **Step 6: Commit the compatibility repair**

```powershell
git add src/features/canvas/canvas-layout.ts __tests__/canvas-layout.test.ts __tests__/memory-edit-draft-repository.test.ts __tests__/memory-repository.test.ts
git commit -m "fix: repair legacy template rotations safely"
```

### Task 3: Normalize shared album template layouts

**Files:**
- Modify: `src/features/gifts/shared-album-mapper.ts`
- Test: `__tests__/shared-album-mapper.test.ts`

- [ ] **Step 1: Add a failing shared snapshot regression**

Add an invited-album fixture whose page contains the exact `collage-2` geometry, stable media references, and legacy rotations `-3`/`3`. Assert:

```ts
const page = mapSharedAlbumToEditablePages(album)[0];
const images = page.layout?.elements.filter((element) => element.type === "image") ?? [];
expect(images[0].rotation).toBeCloseTo(-Math.PI / 60);
expect(images[1].rotation).toBeCloseTo(Math.PI / 60);
expect(images.map((image) => image.uri)).toEqual([firstReadUrl, secondReadUrl]);
```

- [ ] **Step 2: Run the shared mapper test and verify RED**

```powershell
npx jest __tests__/shared-album-mapper.test.ts --runInBand
```

Expected: rotations remain degree-valued.

- [ ] **Step 3: Normalize after stable media resolution**

Import `normalizeLayout` in `shared-album-mapper.ts`. After stripping snapshot-only media fields and replacing image URIs, wrap the constructed `CanvasLayout` with:

```ts
const layout = rawLayout
  ? normalizeLayout({
      ...layoutWithoutCover,
      ...(resolvedCoverImage ? { coverImage: resolvedCoverImage } : {}),
      elements: resolvedElements,
    })
  : undefined;
```

Resolve the cover URL and elements into local constants first so URL mapping still happens before normalization.

- [ ] **Step 4: Run the mapper test and verify GREEN**

Run the command from Step 2.

Expected: PASS, including existing stable-media and invalid-template cases.

- [ ] **Step 5: Commit the shared compatibility path**

```powershell
git add src/features/gifts/shared-album-mapper.ts __tests__/shared-album-mapper.test.ts
git commit -m "fix: normalize shared album template layouts"
```

### Task 4: Show photo/template editing on every page

**Files:**
- Modify: `src/features/canvas/book-canvas-editor.tsx`
- Test: `__tests__/book-canvas-editor.test.tsx`
- Test: `__tests__/gift-shared-editor-canvas-integration.test.tsx`
- Test: `__tests__/memory-canvas-editor.test.tsx`

- [ ] **Step 1: Add failing editor entry tests**

In `book-canvas-editor.test.tsx`, update button lookups from `照片布局` to `照片与模板`, leaving sheet title/accessibility labels unchanged. Add a test starting on the empty cover page:

```ts
const screen = render(<EditorHarness initialPageId="cover" stageSelectedPhoto={stageSelectedPhoto} />);
fireEvent.press(screen.getByText("照片与模板"));
expect(screen.getByText("请先选择照片")).toBeTruthy();
```

Continue the test through “重新选择照片”, select one photo, choose a one-photo template, press “应用照片布局”, and assert the cover page receives the staged URI and selected `photoTemplateId`. Add a legacy cover fixture containing only `photoUri` and verify it exposes the same entry after `canvasPages` normalization.

- [ ] **Step 2: Add failing consumer integration assertions**

In the shared editor integration test, assert the rendered editor contains `照片与模板` for the existing legacy cover. In `memory-canvas-editor.test.tsx`, capture the mocked `BookCanvasEditor` props, add `stageSelectedPhoto` to the mock prop type, and assert the saved local editor supplies a function.

- [ ] **Step 3: Run focused tests and verify RED**

```powershell
npx jest __tests__/book-canvas-editor.test.tsx __tests__/gift-shared-editor-canvas-integration.test.tsx __tests__/memory-canvas-editor.test.tsx --runInBand
```

Expected: button-label and empty-cover assertions fail because the entry is photo-page-only.

- [ ] **Step 4: Make the shared editor entry unconditional**

Replace the conditional toolbar block in `book-canvas-editor.tsx` with:

```tsx
<SmallButton label="📷 添加照片" onPress={() => { void addPhoto(); }} />
<SmallButton label="照片与模板" onPress={editPhotoLayout} />
```

Keep `editPhotoLayout`, the staging transaction, and `PhotoLayoutSheet` unchanged so empty pages still require photo selection before template confirmation.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the command from Step 3.

Expected: all suites PASS.

- [ ] **Step 6: Commit the unified entry**

```powershell
git add src/features/canvas/book-canvas-editor.tsx __tests__/book-canvas-editor.test.tsx __tests__/gift-shared-editor-canvas-integration.test.tsx __tests__/memory-canvas-editor.test.tsx
git commit -m "feat: edit photos and templates on every page"
```

### Task 5: Full verification and documentation closeout

**Files:**
- Modify only if a failing check reveals a scoped issue.

- [ ] **Step 1: Run the required static and unit gates**

```powershell
npm run lint
npm run typecheck
npm run test:ci
```

Expected: all commands exit 0.

- [ ] **Step 2: Run server and iOS beta preflight gates**

```powershell
npm run build:server
npm run beta:preflight:ios
```

Expected: both commands exit 0; no dependency or route changes are introduced.

- [ ] **Step 3: Inspect the final diff**

```powershell
git status --short
git diff --check
git log --oneline -6
```

Expected: no whitespace errors or uncommitted implementation changes; commits show docs, radians, compatibility, shared normalization, and editor-entry stages.

- [ ] **Step 4: Record any gate-only correction**

If a gate required a scoped correction, rerun the affected focused suite plus all five gates, then commit only those exact files:

```powershell
git add <exact-files-reported-by-git-status>
git commit -m "fix: satisfy album template verification"
```

Expected: clean worktree and all gates passing.
