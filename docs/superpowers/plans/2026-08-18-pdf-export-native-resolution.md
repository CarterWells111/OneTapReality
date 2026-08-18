# PDF Export Native Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export every PDF page at the original 360 by 480 canvas resolution in both Expo Go and TestFlight.

**Architecture:** `PageCaptureProvider` owns the raster dimensions sent to `react-native-view-shot`; it will request the unscaled canvas dimensions before the existing HTML-to-PDF flow. The share action, PDF paper size, per-page fallback, and sharing behavior remain unchanged.

**Tech Stack:** Expo, React Native, `react-native-view-shot`, `expo-print`, Jest, React Native Testing Library.

---

### Task 1: Cover the capture resolution

**Files:**
- Create: `__tests__/page-capture-provider.test.tsx`
- Modify: `src/features/export/page-capture-provider.tsx:55-170`

- [ ] **Step 1: Write the failing test**

Create a provider test that mounts `PageCaptureProvider`, supplies one page with a canvas layout, calls `capturePagesAsImages(pages, 360, 480)`, and asserts the mocked `captureRef` receives original dimensions:

```tsx
expect(mockCaptureRef).toHaveBeenCalledWith(
  expect.anything(),
  expect.objectContaining({ width: 360, height: 480 }),
);
```

Mock `react-native-view-shot` to resolve a PNG data URI and use fake timers to advance the provider's render delay.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npx jest --runInBand --runTestsByPath __tests__/page-capture-provider.test.tsx
```

Expected: FAIL because the current capture request is 1080 by 1440.

- [ ] **Step 3: Make the minimal implementation change**

In `src/features/export/page-capture-provider.tsx`, change the scale constant and its documentation:

```tsx
// Use the original 360×480 canvas resolution in every build. This keeps
// multipage TestFlight PDF exports within iOS memory limits.
const CAPTURE_SCALE = 1;
```

Keep `captureRef` width and height expressions unchanged so they evaluate to the caller's `pageWidth` and `pageHeight`.

- [ ] **Step 4: Run the focused tests**

Run:

```powershell
npx jest --runInBand --runTestsByPath __tests__/page-capture-provider.test.tsx __tests__/share-action-sheet.test.ts
```

Expected: PASS. The provider requests 360 by 480 images; the existing PDF export, copy, and share behavior remains green.

- [ ] **Step 5: Commit the implementation**

```powershell
git add -- src/features/export/page-capture-provider.tsx __tests__/page-capture-provider.test.tsx
git commit -m "fix: export PDFs at canvas resolution"
```

### Task 2: Run project quality gates

**Files:**
- Verify only; no source changes expected.

- [ ] **Step 1: Run lint**

```powershell
npm run lint
```

Expected: exit code 0.

- [ ] **Step 2: Run typecheck**

```powershell
npm run typecheck
```

Expected: exit code 0.

- [ ] **Step 3: Run full test suite**

```powershell
npm run test:ci
```

Expected: exit code 0.

- [ ] **Step 4: Run the required server build gate**

```powershell
npm run build:server
```

Expected: exit code 0.
