# Privacy Declaration Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the detailed privacy/data-management block on 我的 with one small declaration entry and move the factual statements plus safe local-data deletion into a native declaration route.

**Architecture:** Keep data clearing in the existing `MemoriesProvider`; move only the UI trigger and its `Alert` confirmation into `src/app/privacy/index.tsx`. The profile tab becomes a navigation client for `/privacy`, while the root stack registers that route. This preserves SQLite, local data, AI, NFC, and account boundaries.

**Tech Stack:** Expo SDK 54, Expo Router 6, React Native, TypeScript strict mode, Jest Expo, React Native Testing Library.

---

## File structure

- Create `src/app/privacy/index.tsx`: declaration copy and data-management action.
- Modify `src/app/(tabs)/profile.tsx`: replace the old privacy section with a small route entry.
- Modify `src/app/_layout.tsx`: register the native declaration route.
- Create `__tests__/privacy-screen.test.tsx`: declaration content and destructive confirmation.
- Modify `__tests__/profile-screen.test.tsx`: profile entry/navigation and removed old controls.
- Modify `__tests__/root-layout.test.tsx`: route registration expectation.

### Task 1: Test and implement the declaration route

**Files:**
- Create: `src/app/privacy/index.tsx`
- Modify: `src/app/_layout.tsx`
- Test: `__tests__/privacy-screen.test.tsx`
- Modify: `__tests__/root-layout.test.tsx`

- [ ] **Step 1: Write failing declaration and route tests**

```tsx
it("shows the local-only, demo AI, and Expo Go NFC statements", () => {
  const screen = render(<PrivacyScreen />);
  expect(screen.getByText("本机数据与隐私声明")).toBeTruthy();
  expect(screen.getByText(/仅保存在本机 SQLite/)).toBeTruthy();
  expect(screen.getByText(/不识别人物或地点/)).toBeTruthy();
  expect(screen.getByText(/Expo Go 仅展示模拟碰一碰/)).toBeTruthy();
});

it("requires destructive confirmation before clearing local data", async () => {
  const screen = render(<PrivacyScreen />);
  await fireEvent.press(screen.getByText("删除所有本地数据"));
  expect(mockAlert).toHaveBeenCalledWith("删除所有本地记忆？", expect.any(String), expect.arrayContaining([expect.objectContaining({ style: "destructive" })]));
  expect(mockClearAllMemories).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm run test:ci -- privacy-screen.test.tsx root-layout.test.tsx`

Expected: FAIL because the privacy route module and `privacy/index` stack screen do not exist.

- [ ] **Step 3: Implement the route and stack registration**

`PrivacyScreen` uses `useMemories()` and a local `confirmClear()` whose Alert title, explanatory copy, cancel button, destructive button, and `clearAllMemories` callback match the existing profile behavior exactly. Render three static information cards: local SQLite-only storage, local DemoDraftGenerator limitations, and Expo Go simulated NFC. Place `AppButton` with label `删除所有本地数据` and danger tone only under a `数据管理` section. Add `<Stack.Screen name="privacy/index" options={{ title: "本机数据与隐私声明" }} />` after `settings/index`.

- [ ] **Step 4: Verify focused tests and types**

Run: `npm run test:ci -- privacy-screen.test.tsx root-layout.test.tsx && npm run typecheck`

Expected: all commands exit 0.

- [ ] **Step 5: Commit the new route**

Commit: `git add src/app/privacy/index.tsx src/app/_layout.tsx __tests__/privacy-screen.test.tsx __tests__/root-layout.test.tsx && git commit -m "feat: add privacy declaration route"`.

### Task 2: Test and simplify the profile footer

**Files:**
- Modify: `src/app/(tabs)/profile.tsx`
- Modify: `__tests__/profile-screen.test.tsx`

- [ ] **Step 1: Write failing profile-entry tests**

```tsx
it("routes the compact privacy note to the declaration page", async () => {
  const screen = render(<ProfileScreen />);
  await fireEvent.press(screen.getByText("本机数据与隐私声明 ›"));
  expect(mockPush).toHaveBeenCalledWith("/privacy");
});

it("does not render the old privacy section or delete control", () => {
  const screen = render(<ProfileScreen />);
  expect(screen.queryByText("本机数据与隐私")).toBeNull();
  expect(screen.queryByText("删除所有本地数据")).toBeNull();
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm run test:ci -- profile-screen.test.tsx`

Expected: FAIL because the compact declaration entry is absent and the old privacy section still renders.

- [ ] **Step 3: Implement the compact entry**

Remove `Alert` and `clearAllMemories` from `ProfileScreen`, remove the old privacy section/cards/delete button, and add a single footer `Pressable` after the next-step section. It must have `accessibilityRole="button"`, label `打开本机数据与隐私声明`, `minHeight: 44`, subdued `colors.muted` text `本机数据与隐私声明 ›`, and push `/privacy`. Keep profile loading, archive, stats, recent memory, gift, settings, and existing navigation unchanged.

- [ ] **Step 4: Verify focused behavior**

Run: `npm run test:ci -- profile-screen.test.tsx privacy-screen.test.tsx`

Expected: PASS; only the declaration page exposes the deletion action.

- [ ] **Step 5: Commit the profile simplification**

Commit: `git add 'src/app/(tabs)/profile.tsx' __tests__/profile-screen.test.tsx && git commit -m "feat: simplify profile privacy entry"`.

### Task 3: Run complete verification and create the Draft PR

**Files:**
- Create: `docs/superpowers/plans/2026-07-22-privacy-declaration.md`

- [ ] **Step 1: Run static and test checks**

Run: `npm run lint && npm run typecheck && npm run test:ci && npx expo-doctor && npx expo export --platform ios --output-dir .expo-export`

Expected: all commands exit 0. Remove only the generated `.expo-export` directory after confirming the export exists.

- [ ] **Step 2: Manually verify Expo Go**

1. Open 我的 and verify only the compact declaration note appears below the main content.
2. Tap the note and verify all three statements plus `数据管理` appear.
3. Tap delete, cancel, and verify travel memories remain.
4. Repeat and choose delete only if using disposable demo data; verify the profile returns to empty state.

- [ ] **Step 3: Commit plan, push, and open a Draft PR**

Commit: `git add docs/superpowers/plans/2026-07-22-privacy-declaration.md && git commit -m "docs: add privacy declaration plan"`.

Push: `git push -u origin codex/privacy-declaration`.

PR: `gh pr create --draft --base main --head codex/privacy-declaration --title "feat: add privacy declaration entry"`.

## Self-review

- Task 1 preserves deletion confirmation and moves all privacy/NFC statements to a stack route.
- Task 2 makes the profile page compact without deleting the data-management capability.
- Task 3 covers static checks, iOS export cleanup, Expo Go acceptance, and the required separate Draft PR.
- The only new route is consistently named `/privacy` and `privacy/index`; no account, cloud, AI, real NFC, payment, schema, or data migration is introduced.
