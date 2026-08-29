# Photo Layout Sheet Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show selected photos above the replacement action and render a large, immediately updating layout preview below template choices.

**Architecture:** `PhotoLayoutSheet` remains the sole owner of transient photo/template selection. It derives one preview `CanvasLayout` from `photoUris` and `selection`, renders it through a small local preview block, and keeps all persistence and confirmation callbacks unchanged.

**Tech Stack:** TypeScript, React Native, Expo Image, Jest, React Native Testing Library

---

### Task 1: Add selected-photo and live-layout preview behavior

**Files:**
- Modify: `src/features/canvas/photo-layout-sheet.tsx`
- Test: `__tests__/photo-layout-sheet.test.tsx`

- [ ] **Step 1: Write failing selected-photo order tests**

Add a test that renders edit mode with two local photo URIs and inspects the `ScrollView` children:

```tsx
it("shows selected photos immediately above the replacement action", () => {
  const screen = render(
    <PhotoLayoutSheet
      action="edit"
      onCancel={() => undefined}
      onConfirm={() => undefined}
      onReplacePhotos={() => undefined}
      photoUris={["file:///one.jpg", "file:///two.jpg"]}
      selectedTemplateId="classic-2"
    />,
  );
  const content = screen.getByTestId("photo-layout-content");
  expect(screen.getByText("已选择图片")).toBeTruthy();
  expect(screen.getByLabelText("照片 1").props.source).toEqual([{ uri: "file:///one.jpg" }]);
  expect(screen.getByLabelText("照片 2").props.source).toEqual([{ uri: "file:///two.jpg" }]);
  expect(content.props.children[0].props.testID).toBe("selected-photo-section");
  expect(content.props.children[1].props.accessibilityLabel).toBe("重新选择照片");
});
```

Add a zero-photo assertion that `queryByText("已选择图片")` is null.

- [ ] **Step 2: Write failing live-preview tests**

Render two photos with `selectedTemplateId="magazine-2"`, assert `布局效果预览` has `aspectRatio: 0.75`, both preview image sources match the selected photos, and the first image geometry is `{ left: "8%", top: "9%", width: "52%", height: "82%" }`. Press `竖向切片双图模板` and assert the same preview image immediately changes to `{ left: "8%", top: "8%", width: "39%", height: "84%" }`.

Add a no-selection assertion that one to three photos still render `布局效果预览` using `createPhotoLayout`. Keep the existing four-photo test and update its preview label from `自由排版预览` to `布局效果预览`.

- [ ] **Step 3: Run the focused suite and verify RED**

```powershell
npx jest __tests__/photo-layout-sheet.test.tsx --runInBand
```

Expected: FAIL because the selected-photo heading, stable content test IDs, and one-to-three-photo large preview do not exist.

- [ ] **Step 4: Derive one preview layout**

Import `createPhotoTemplateLayout` and replace `freeformLayout` with:

```ts
const previewLayout = React.useMemo(
  () => (selection
    ? createPhotoTemplateLayout(photoUris, selection)
    : photoCount > 0
      ? createPhotoLayout(photoUris)
      : null),
  [photoCount, photoUris, selection],
);
```

The memo returns `null` only for zero photos or an invalid transient selection.

- [ ] **Step 5: Render the approved information order**

Add `testID="photo-layout-content"` to the `ScrollView`. Wrap non-empty thumbnails in:

```tsx
<View style={styles.selectedPhotoSection} testID="selected-photo-section">
  <Text selectable style={styles.sectionTitle}>已选择图片</Text>
  <View style={styles.thumbnailRow}>
    {photoUris.map((uri, index) => (
      <Image
        accessibilityLabel={`照片 ${index + 1}`}
        contentFit="cover"
        key={`${uri}-${index}`}
        source={{ uri }}
        style={styles.thumbnail}
      />
    ))}
  </View>
</View>
```

Keep “重新选择照片” immediately after this section. For one to three photos, keep `PhotoTemplatePicker` and render the preview after it. For four or more, render the warning followed by the same preview block. Use:

```tsx
<View
  accessibilityLabel="布局效果预览"
  accessibilityRole="image"
  style={[styles.layoutPreview, { aspectRatio: previewLayout.aspectRatio }]}
>
  {previewLayout.elements.map((element, index) => element.type === "image" ? (
    <Image
      accessibilityLabel={`布局效果预览照片 ${index + 1}`}
      contentFit="cover"
      key={element.id}
      source={{ uri: element.uri }}
      style={{
        height: percent(element.height),
        left: percent(element.x),
        position: "absolute",
        top: percent(element.y),
        transform: [{ rotate: `${element.rotation}rad` }],
        width: percent(element.width),
      }}
      testID={`photo-layout-preview-${element.id}`}
    />
  ) : null)}
</View>
```

Use one shared `layoutPreview` style and preserve the existing warning, hint, busy, cancel, and confirm behavior.

- [ ] **Step 6: Run focused tests and verify GREEN**

```powershell
npx jest __tests__/photo-layout-sheet.test.tsx __tests__/book-canvas-editor.test.tsx --runInBand --silent
```

Expected: both suites PASS, including the existing staged-photo and template confirmation transactions.

- [ ] **Step 7: Commit the feature**

```powershell
git add src/features/canvas/photo-layout-sheet.tsx __tests__/photo-layout-sheet.test.tsx
git commit -m "feat: preview selected photo layouts"
```

### Task 2: Run repository quality gates

**Files:**
- Modify only if a scoped gate failure is caused by this change.

- [ ] **Step 1: Run static and full test gates**

```powershell
npm run lint
npm run typecheck
npm run test:ci
```

Expected: all commands exit 0.

- [ ] **Step 2: Run build and beta preflight gates**

```powershell
npm run build:server
npm run beta:preflight:ios
```

Expected: both commands exit 0 and beta preflight still reports version `1.1.2` with staging origins.

- [ ] **Step 3: Inspect delivery state**

```powershell
git status --short --branch
git diff --check
git log --oneline -5
```

Expected: clean `codex/album-photo-page-templates` worktree with the design, plan, and feature commits at the tip.
