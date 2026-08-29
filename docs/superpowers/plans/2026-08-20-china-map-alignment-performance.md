# China Map Alignment and Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the China map, city markers, and prefecture labels aligned on tall iPhone screens, keep controls below the safe area, and reduce gesture-frame label work while removing only county-level entries.

**Architecture:** Treat the measured workspace and its aspect-fit China content frame as the only projection source. Keep the full offline label catalog for stable selection, but mount only settled visible candidates and update their screen anchors directly from shared viewport values; recompute collisions only when layout or a gesture/animation settles.

**Tech Stack:** Expo Router, React Native, react-native-safe-area-context, React Native Reanimated, React Native Gesture Handler, Jest, TypeScript.

---

### Task 1: Filter county-level map labels

**Files:**
- Modify: `.tmp-mapdata/generate-china-map.mjs`
- Modify: `src/features/cities/china-map-data.ts`
- Test: `__tests__/china-map-generated-data.test.ts`

- [ ] **Step 1: Write the failing catalog test**

Add assertions that the generated catalog contains exactly 341 labels and every adcode ends in `00`, while all 36 product cities remain mapped:

```ts
expect(chinaPrefectureLabels).toHaveLength(341);
expect(chinaPrefectureLabels.every(({ adcode }) => adcode.endsWith("00"))).toBe(true);
expect(productCities).toEqual([...cities].sort());
```

- [ ] **Step 2: Verify the test fails**

Run: `npx jest __tests__/china-map-generated-data.test.ts --runInBand`

Expected: FAIL because the current catalog has 373 entries and includes 32 non-`00` adcodes.

- [ ] **Step 3: Filter before label generation**

Build `prefectureFeatures` only from source features whose six-digit adcode ends in `00`, then append synthetic `710100` when absent:

```js
const prefectureFeatures = prefectureCollection.features.filter((feature) => {
  const adcode = String(feature.properties.id || feature.properties["区划码"]);
  return /^\d{4}00$/.test(adcode);
});
```

Regenerate with `node .tmp-mapdata/generate-china-map.mjs`.

- [ ] **Step 4: Verify catalog tests pass**

Run: `npx jest __tests__/china-map-generated-data.test.ts __tests__/city-map-data.test.ts --runInBand`

Expected: PASS with 341 labels and 36 product cities.

### Task 2: Mount only settled visible labels on the measured content frame

**Files:**
- Modify: `src/features/cities/city-label-layout.ts`
- Modify: `src/features/cities/city-map.tsx`
- Test: `__tests__/city-label-layout.test.ts`
- Test: `__tests__/city-map-interactions.test.tsx`
- Test: `__tests__/city-map.test.tsx`

- [ ] **Step 1: Write failing projection and label-pool tests**

Export a candidate selector and assert that it returns only visible labels, never more than the capital set plus 24 non-capitals, and that a normalized coordinate uses the same aspect-fit content frame as the SVG:

```ts
const visible = resolveVisibleCityLabels(labels, viewport, portraitSize);
expect(visible.every((label) => layoutsByCode.get(label.adcode)?.visible)).toBe(true);
expect(visible.filter((label) => !label.isCapital)).toHaveLength(24);
expect(resolveNormalizedMapScreenPoint({ x: 0.5, y: 0.5 }, viewport, portraitSize))
  .toEqual({ x: portraitSize.width / 2, y: portraitSize.height / 2 });
```

Render the workspace before and after `onLayout`; assert no prefecture label is mounted before measurement and the mounted label count is below 60 afterward.

- [ ] **Step 2: Verify the new tests fail**

Run: `npx jest __tests__/city-label-layout.test.ts __tests__/city-map.test.tsx __tests__/city-map-interactions.test.tsx --runInBand`

Expected: FAIL because all 373 labels are currently mounted and the workspace starts with design-time dimensions.

- [ ] **Step 3: Add one shared projection API**

In `city-label-layout.ts`, export the aspect-fit projection and edge-opacity helpers and add a stable visible selector:

```ts
export function resolveNormalizedMapScreenPoint(coordinate, viewport, size) {
  const content = resolveContentFrame(size);
  const baseX = content.x + coordinate.x * content.width;
  const baseY = content.y + coordinate.y * content.height;
  return {
    x: size.width / 2 + (baseX - size.width / 2) * viewport.scale + viewport.translateX,
    y: size.height / 2 + (baseY - size.height / 2) * viewport.scale + viewport.translateY,
  };
}

export function resolveVisibleCityLabels(labels, viewport, size, zoomTier) {
  const visibleCodes = new Set(resolveCityLabelLayouts(labels, viewport, size, zoomTier)
    .filter(({ visible }) => visible)
    .map(({ adcode }) => adcode));
  return labels.filter(({ adcode }) => visibleCodes.has(adcode));
}
```

- [ ] **Step 4: Replace the 341-item per-frame layout array**

Initialize workspace dimensions to zero. Store only settled visible labels in React state. Recompute that state after real layout, pan/pinch finalize, double-tap completion, and search-focus animation completion. Use `runOnJS` only at those completion boundaries.

Each mounted label computes only its anchor and central-window opacity from shared `scale`, `translateX`, `translateY`, `mapWidth`, and `mapHeight`. Use `FadeIn.duration(140)` and `FadeOut.duration(140)` for mount changes instead of calling `withTiming` during every style evaluation.

- [ ] **Step 5: Verify label and gesture tests pass**

Run: `npx jest __tests__/city-label-layout.test.ts __tests__/city-map.test.tsx __tests__/city-map-interactions.test.tsx --runInBand`

Expected: PASS; gesture update handlers do not call JS, stable completion handlers refresh candidates, and fewer than 60 label components are mounted.

### Task 3: Keep the fullscreen header below the iPhone safe area

**Files:**
- Modify: `src/app/city-map/index.tsx`
- Test: `__tests__/city-map-fullscreen-layout.test.tsx`

- [ ] **Step 1: Write failing inset tests**

Mock zero and normal safe-area insets and verify the root uses an explicit portrait fallback while the close target remains `44 × 44pt`:

```ts
expect(resolveFullscreenMapInsets({ top: 0, bottom: 0 }, { width: 390, height: 844 }))
  .toEqual({ paddingBottom: 4, paddingTop: 54 });
expect(resolveFullscreenMapInsets({ top: 59, bottom: 34 }, { width: 390, height: 844 }))
  .toEqual({ paddingBottom: 34, paddingTop: 59 });
```

- [ ] **Step 2: Verify the inset tests fail**

Run: `npx jest __tests__/city-map-fullscreen-layout.test.tsx --runInBand`

Expected: FAIL because the route relies on implicit `SafeAreaView` behavior.

- [ ] **Step 3: Apply explicit insets**

Replace the outer `SafeAreaView` with a `View`, read `useSafeAreaInsets()` and `useWindowDimensions()`, and apply the pure helper result to the root:

```ts
export function resolveFullscreenMapInsets(insets, size) {
  const portraitFallback = size.height > size.width ? 54 : 12;
  return {
    paddingBottom: Math.max(insets.bottom, 4),
    paddingTop: Math.max(insets.top, portraitFallback),
  };
}
```

Reduce the header's own top padding to 8 so spacing is not double-counted.

- [ ] **Step 4: Verify fullscreen layout tests pass**

Run: `npx jest __tests__/city-map-fullscreen-layout.test.tsx --runInBand`

Expected: PASS for both zero-inset and Dynamic Island-sized inset cases.

### Task 4: Complete regression and production verification

**Files:**
- Review: all modified map files and tests

- [ ] **Step 1: Run focused map tests**

Run: `npx jest __tests__/china-map-generated-data.test.ts __tests__/city-label-layout.test.ts __tests__/city-map.test.tsx __tests__/city-map-interactions.test.tsx __tests__/city-map-fullscreen-layout.test.tsx __tests__/city-workspace.test.ts --runInBand`

Expected: all selected suites pass.

- [ ] **Step 2: Run required gates**

Run, in order:

```text
npm run lint
npm run typecheck
npm run test:ci
npm run build:server
```

Expected: all commands exit zero.

- [ ] **Step 3: Verify deterministic generation and clean diff**

Run the generator twice, compare the SHA-256 of `src/features/cities/china-map-data.ts`, then run `git diff --check`.

Expected: identical hashes and no whitespace errors.

- [ ] **Step 4: Perform visual verification**

Use an iPhone-sized viewport or native iPhone build to verify the header is below the system area, labels overlap their map anchors, only settled candidates appear, and pan/pinch remain responsive. Record any environment limitation rather than claiming an unavailable native check passed.
