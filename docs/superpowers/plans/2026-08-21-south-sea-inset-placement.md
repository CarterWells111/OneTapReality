# South China Sea Inset Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the fixed South China Sea inset to the bottom-left sea area and make generation fail if the inset overlaps any province or leaves the map viewBox.

**Architecture:** Keep placement and validation in the offline map generator so overview and fullscreen renderers continue consuming one immutable frame without runtime branching. Tests inspect generated SVG coordinates and frame geometry, then deterministic regeneration updates only the generated map data.

**Tech Stack:** Node.js ESM generator, TypeScript, Jest, React Native SVG generated data.

---

### Task 1: Lock the safe bottom-left inset contract with tests

**Files:**
- Modify: `__tests__/china-map-generated-data.test.ts`

- [ ] **Step 1: Add rectangle helpers and the failing placement test**

Add these helpers after `pathCoordinates`:

```ts
function boundsForPath(path: string) {
  const coordinates = pathCoordinates(path);
  return {
    left: Math.min(...coordinates.map(({ x }) => x)),
    top: Math.min(...coordinates.map(({ y }) => y)),
    right: Math.max(...coordinates.map(({ x }) => x)),
    bottom: Math.max(...coordinates.map(({ y }) => y)),
  };
}

function rectanglesOverlap(
  first: { left: number; top: number; right: number; bottom: number },
  second: { left: number; top: number; right: number; bottom: number },
) {
  return first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top;
}
```

Extend the South China Sea inset test with:

```ts
const map = parseViewBox(chinaMapViewBox);
const frame = chinaSouthSeaInset.frame;
const insetBounds = {
  left: frame.x,
  top: frame.y,
  right: frame.x + frame.width,
  bottom: frame.y + frame.height,
};

expect(frame.x).toBe(16);
expect(map.height - insetBounds.bottom).toBe(12);
expect(insetBounds.left).toBeGreaterThanOrEqual(map.minX);
expect(insetBounds.top).toBeGreaterThanOrEqual(map.minY);
expect(insetBounds.right).toBeLessThanOrEqual(map.minX + map.width);
expect(insetBounds.bottom).toBeLessThanOrEqual(map.minY + map.height);
for (const province of chinaProvinces) {
  expect(rectanglesOverlap(insetBounds, boundsForPath(province.path))).toBe(false);
}
```

- [ ] **Step 2: Run the focused test and verify the old placement fails**

Run: `npx jest __tests__/china-map-generated-data.test.ts --runInBand`

Expected: FAIL because `chinaSouthSeaInset.frame.x` is `852`, not `16` (and the right-hand frame overlaps Taiwan's path bounds).

- [ ] **Step 3: Commit the red test**

```powershell
git add -- __tests__/china-map-generated-data.test.ts
git commit -m "test: require safe south sea inset placement"
```

### Task 2: Move and validate the inset during generation

**Files:**
- Modify: `.tmp-mapdata/generate-china-map.mjs`
- Modify: `src/features/cities/china-map-data.ts`
- Test: `__tests__/china-map-generated-data.test.ts`

- [ ] **Step 1: Add generator rectangle validation**

After `mainTransform`, add:

```js
function transformedBounds(polygons, transform) {
  return boundsForPolygons(polygons.map((polygon) => polygon.map(transform)));
}

function rectanglesOverlap(first, second) {
  return first.minX < second.maxX
    && first.maxX > second.minX
    && first.minY < second.maxY
    && first.maxY > second.minY;
}
```

Replace the inset frame horizontal coordinate and validate it immediately after construction:

```js
const insetFrame = {
  x: 16,
  y: viewBoxHeight - INSET_HEIGHT - 12,
  width: INSET_WIDTH,
  height: INSET_HEIGHT,
};
const insetFrameBounds = {
  minX: insetFrame.x,
  minY: insetFrame.y,
  maxX: insetFrame.x + insetFrame.width,
  maxY: insetFrame.y + insetFrame.height,
};

if (
  insetFrameBounds.minX < 0
  || insetFrameBounds.minY < 0
  || insetFrameBounds.maxX > VIEWBOX_WIDTH
  || insetFrameBounds.maxY > viewBoxHeight
) {
  throw new Error("South China Sea inset frame must remain inside the main viewBox");
}

for (const province of projectedProvinces) {
  const provinceBounds = transformedBounds(province.polygons, mainTransform);
  if (rectanglesOverlap(insetFrameBounds, provinceBounds)) {
    throw new Error(`South China Sea inset frame overlaps province ${province.id}`);
  }
}
```

- [ ] **Step 2: Regenerate the immutable map data**

Run: `node .tmp-mapdata/generate-china-map.mjs`

Expected: generator exits 0, reports 34 provinces, and emits `chinaSouthSeaInset.frame.x` as `16` in `src/features/cities/china-map-data.ts`.

- [ ] **Step 3: Run the focused test and verify it passes**

Run: `npx jest __tests__/china-map-generated-data.test.ts --runInBand`

Expected: PASS, including viewBox containment and non-overlap for all 34 province paths.

- [ ] **Step 4: Verify deterministic generation**

Run the following in PowerShell:

```powershell
$before = (Get-FileHash src/features/cities/china-map-data.ts -Algorithm SHA256).Hash
node .tmp-mapdata/generate-china-map.mjs
$after = (Get-FileHash src/features/cities/china-map-data.ts -Algorithm SHA256).Hash
if ($before -ne $after) { throw "Map generation is not deterministic" }
```

Expected: the second generator run exits 0 and the hash comparison does not throw.

- [ ] **Step 5: Commit the implementation**

```powershell
git add -- .tmp-mapdata/generate-china-map.mjs src/features/cities/china-map-data.ts
git commit -m "fix: move south sea inset away from Taiwan"
```

### Task 3: Run release checks and review the final diff

**Files:**
- Verify: `.tmp-mapdata/generate-china-map.mjs`
- Verify: `src/features/cities/china-map-data.ts`
- Verify: `__tests__/china-map-generated-data.test.ts`

- [ ] **Step 1: Run lint and type checking**

Run: `npm run lint`

Expected: exit 0 with no lint errors.

Run: `npm run typecheck`

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 2: Run all automated tests**

Run: `npm run test:ci`

Expected: exit 0 with all Jest and Node test suites passing.

- [ ] **Step 3: Run the production server build**

Run: `npm run build:server`

Expected: exit 0 and Expo web export completes.

- [ ] **Step 4: Inspect scope and whitespace**

Run: `git diff --check` and `git status --short`

Expected: no whitespace errors; only the previously present unrelated `package.json` and `package-lock.json` edits remain unstaged after the task commits.

- [ ] **Step 5: Commit any verification-only test correction if required**

If no correction was needed, do not create an empty commit. If a test-only correction was required, stage only that test and commit it:

```powershell
git add -- __tests__/china-map-generated-data.test.ts
git commit -m "test: harden south sea inset regression coverage"
```
