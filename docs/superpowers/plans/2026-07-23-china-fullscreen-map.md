# China Fullscreen Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simplified outline with an offline province map and provide a crash-safe native fullscreen map route.

**Architecture:** `@svg-maps/china` supplies packaged province path data. A reusable renderer draws paths and markers; a native route hosts the workspace variant. Reanimated shared values own active gesture transforms while React state records layout/final state only.

**Tech Stack:** Expo Router, React Native SVG, React Native Gesture Handler, Reanimated, Jest.

---

### Task 1: Establish offline province data and attribution

**Files:**
- Modify: `docs/DECISIONS.md`
- Create: `docs/ATTRIBUTIONS.md`
- Modify: `__tests__/city-map-data.test.ts`
- Modify: `src/features/cities/city-map.tsx`

- [ ] Write a failing test expecting all package locations to render as SVG `Path` elements with a visible source attribution.
- [ ] Run `npm run test:ci -- __tests__/city-map-data.test.ts` and verify it fails because the renderer still uses one `Polygon`.
- [ ] Render the package's local path data, keeping province strokes visible and adding CC-BY attribution.
- [ ] Re-run the focused test and verify it passes.

### Task 2: Add fullscreen navigation and worklet-only gestures

**Files:**
- Modify: `__tests__/city-map-interactions.test.tsx`
- Create: `__tests__/city-map-fullscreen-route.test.tsx`
- Modify: `src/features/cities/city-map.tsx`
- Modify: `src/app/(tabs)/cities.tsx`
- Create: `src/app/city-map/index.tsx`
- Modify: `src/app/_layout.tsx`

- [ ] Write failing tests for the fullscreen affordance/navigation, screen presentation, transform safety, and clamped worklet values without frame callbacks.
- [ ] Run the focused tests and verify they fail because no fullscreen route or worklet style exists.
- [ ] Route overview map background and explicit affordance to a native `fullScreenModal` route; keep marker presses targeting city detail.
- [ ] Use a guaranteed transform array inside `useAnimatedStyle`; update only shared values in `onUpdate`; calculate clamped bounds from shared layout dimensions.
- [ ] Re-run focused tests and verify they pass.

### Task 3: Verify and commit

**Files:**
- Verify all modified files

- [ ] Run `npm run lint`, `npm run typecheck`, `npm run test:ci`, and `npx expo-doctor`.
- [ ] Commit the implementation with a conventional commit message.

