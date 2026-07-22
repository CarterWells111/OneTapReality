# Local Profile Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an offline nickname and avatar to the travel archive page, with a native settings screen for managing that local profile.

**Architecture:** A `LocalProfile` record is saved as JSON at `luyi.local-profile.v1` through Expo SQLite's built-in key-value store. A context provider makes it available to the profile tab and settings route. The photo picker only opens after an explicit user press; no account, network, AI, or memory-table change is allowed.

**Tech Stack:** Expo SDK 54, Expo Router 6, React Native, TypeScript strict mode, `expo-image-picker`, `expo-sqlite/kv-store`, Jest Expo, React Native Testing Library.

---

## File structure

- Create `src/features/profile/local-profile.ts`: `LocalProfile`, default, and nickname normalization.
- Create `src/features/profile/profile-storage.ts`: local JSON persistence adapter.
- Create `src/features/profile/profile-provider.tsx`: shared asynchronous state.
- Create `src/components/profile-avatar.tsx`: image-or-initial avatar.
- Create `src/app/settings/index.tsx`: settings screen.
- Modify `src/app/_layout.tsx` and `src/app/(tabs)/profile.tsx`: wire provider, route, and entry.
- Create `__tests__/local-profile.test.ts`, `__tests__/profile-storage.test.ts`, `__tests__/profile-avatar.test.tsx`, and `__tests__/settings-screen.test.tsx`; update `__tests__/profile-screen.test.tsx`.

### Task 1: Test and implement local profile persistence

**Files:**
- Create: `src/features/profile/local-profile.ts`
- Create: `src/features/profile/profile-storage.ts`
- Test: `__tests__/local-profile.test.ts`
- Test: `__tests__/profile-storage.test.ts`

- [ ] **Step 1: Write failing domain tests**

```ts
import { DEFAULT_LOCAL_PROFILE, normalizeNickname } from "../src/features/profile/local-profile";

it("uses the default for empty values and trims the nickname", () => {
  expect(DEFAULT_LOCAL_PROFILE).toEqual({ nickname: "旅忆用户", avatarUri: null });
  expect(normalizeNickname("  小林  ")).toBe("小林");
  expect(normalizeNickname(" ")).toBe("旅忆用户");
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm run test:ci -- local-profile.test.ts`

Expected: FAIL because `local-profile` does not exist.

- [ ] **Step 3: Implement the domain module**

```ts
export type LocalProfile = { nickname: string; avatarUri: string | null };
export const DEFAULT_LOCAL_PROFILE: LocalProfile = { nickname: "旅忆用户", avatarUri: null };
export function normalizeNickname(value: string) { return value.trim() || DEFAULT_LOCAL_PROFILE.nickname; }
```

- [ ] **Step 4: Write failing storage tests**

```ts
jest.mock("expo-sqlite/kv-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }));
import storage from "expo-sqlite/kv-store";
import { loadLocalProfile, saveLocalProfile } from "../src/features/profile/profile-storage";

it("returns defaults for absent or invalid JSON", async () => {
  (storage.getItemAsync as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce("bad-json");
  await expect(loadLocalProfile()).resolves.toEqual({ nickname: "旅忆用户", avatarUri: null });
  await expect(loadLocalProfile()).resolves.toEqual({ nickname: "旅忆用户", avatarUri: null });
});
it("writes normalized local profile JSON", async () => {
  await saveLocalProfile({ nickname: " 小林 ", avatarUri: "file://avatar.jpg" });
  expect(storage.setItemAsync).toHaveBeenCalledWith("luyi.local-profile.v1", JSON.stringify({ nickname: "小林", avatarUri: "file://avatar.jpg" }));
});
```

- [ ] **Step 5: Run the failing storage test**

Run: `npm run test:ci -- profile-storage.test.ts`

Expected: FAIL because `profile-storage` does not exist.

- [ ] **Step 6: Implement the storage adapter**

```ts
import storage from "expo-sqlite/kv-store";
import { DEFAULT_LOCAL_PROFILE, normalizeNickname, type LocalProfile } from "./local-profile";

const KEY = "luyi.local-profile.v1";
export async function loadLocalProfile(): Promise<LocalProfile> {
  const raw = await storage.getItemAsync(KEY);
  if (!raw) return DEFAULT_LOCAL_PROFILE;
  try {
    const value = JSON.parse(raw) as Partial<LocalProfile>;
    return { nickname: normalizeNickname(typeof value.nickname === "string" ? value.nickname : ""), avatarUri: typeof value.avatarUri === "string" ? value.avatarUri : null };
  } catch { return DEFAULT_LOCAL_PROFILE; }
}
export async function saveLocalProfile(value: LocalProfile) {
  await storage.setItemAsync(KEY, JSON.stringify({ nickname: normalizeNickname(value.nickname), avatarUri: value.avatarUri }));
}
```

- [ ] **Step 7: Verify and commit**

Run: `npm run test:ci -- local-profile.test.ts profile-storage.test.ts`

Expected: PASS.

Commit: `git add src/features/profile/local-profile.ts src/features/profile/profile-storage.ts __tests__/local-profile.test.ts __tests__/profile-storage.test.ts && git commit -m "feat: persist local profile"`.

### Task 2: Test and implement profile state, avatar, and settings UI

**Files:**
- Create: `src/features/profile/profile-provider.tsx`
- Create: `src/components/profile-avatar.tsx`
- Create: `src/app/settings/index.tsx`
- Modify: `src/app/_layout.tsx`
- Modify: `src/app/(tabs)/profile.tsx`
- Test: `__tests__/profile-avatar.test.tsx`
- Test: `__tests__/settings-screen.test.tsx`
- Modify: `__tests__/profile-screen.test.tsx`

- [ ] **Step 1: Write failing avatar and navigation tests**

```tsx
import { render, fireEvent } from "@testing-library/react-native";
import { ProfileAvatar } from "../src/components/profile-avatar";

it("shows a first-character fallback", () => {
  const screen = render(<ProfileAvatar nickname="小林" avatarUri={null} />);
  expect(screen.getByLabelText("小林的头像")).toBeTruthy();
  expect(screen.getByText("小")).toBeTruthy();
});
it("opens settings from the archive header", async () => {
  const screen = render(<ProfileScreen />);
  await fireEvent.press(screen.getByLabelText("打开设置"));
  expect(mockPush).toHaveBeenCalledWith("/settings");
});
```

- [ ] **Step 2: Run the failing UI tests**

Run: `npm run test:ci -- profile-avatar.test.tsx profile-screen.test.tsx settings-screen.test.tsx`

Expected: FAIL because the avatar component, settings route, and `打开设置` control do not exist.

- [ ] **Step 3: Implement shared state and accessible avatar**

`ProfileProvider` exposes `profile`, `isProfileReady`, and `updateProfile(next: LocalProfile)`. It loads once with `loadLocalProfile`, calls `saveLocalProfile` before setting the normalized result, and `useProfile()` throws outside the provider. `ProfileAvatar` uses `<Image accessibilityLabel={`${nickname}的头像`} source={{ uri: avatarUri }} />` for a URI; otherwise it displays `nickname.slice(0, 1)` in a circular warm-green view. Add the provider around the existing `MemoriesProvider` and register `settings/index` with title `设置`.

- [ ] **Step 4: Implement the two screens**

The profile tab shows the current avatar and nickname above `我们的旅行档案`, plus a 44px minimum `Pressable` labelled `打开设置` that pushes `/settings`. Preserve every existing summary, recent-memory, gift, privacy, NFC, loading, and clear-memory confirmation behavior.

The settings route shows current avatar, `TextInput` labelled `昵称`, `选择头像`, `移除头像`, and `保存资料`. `选择头像` first invokes `ImagePicker.requestMediaLibraryPermissionsAsync()`, shows `未获得照片权限。你可以在系统设置中允许访问后再选择头像。` if denied, otherwise invokes `launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], mediaTypes: ["images"], quality: 0.8 })`. Saving calls `updateProfile({ nickname, avatarUri })` and returns. Include a `本机数据与隐私` card. Do not add account, login, logout, cancellation, payment, cloud, remote URL, AI, NFC, or destructive controls.

- [ ] **Step 5: Add settings permission test and verify**

```tsx
it("does not request photo permission before a deliberate avatar selection", async () => {
  const screen = render(<SettingsScreen />);
  expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText("选择头像"));
  expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
});
```

Run: `npm run test:ci -- profile-avatar.test.tsx profile-screen.test.tsx settings-screen.test.tsx && npm run typecheck`

Expected: all tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit**

Commit: `git add src/features/profile/profile-provider.tsx src/components/profile-avatar.tsx src/app/_layout.tsx src/app/settings/index.tsx 'src/app/(tabs)/profile.tsx' __tests__/profile-avatar.test.tsx __tests__/profile-screen.test.tsx __tests__/settings-screen.test.tsx && git commit -m "feat: add local profile settings screen"`.

### Task 3: Verify, document, and open the Draft PR

**Files:**
- Modify: `docs/DECISIONS.md`
- Create: `docs/superpowers/plans/2026-07-22-local-profile-settings.md`

- [ ] **Step 1: Verify the decision record**

Run: `rg -n "本机个人资料与设置|不提供登录、退出或注销" docs/DECISIONS.md`

Expected: the local-only/no-account decision is present.

- [ ] **Step 2: Run full verification**

Run: `npm run lint && npm run typecheck && npm run test:ci && npx expo-doctor && npx expo export --platform ios --output-dir .expo-export`

Expected: every command exits 0. Remove only the generated `.expo-export` directory after confirming the export exists.

- [ ] **Step 3: Manually verify Expo Go**

1. Run `npx expo start --clear`, then open the QR code in Expo Go.
2. Verify the default local profile, edit nickname and avatar, restart, and verify persistence.
3. Remove the avatar and verify its initial fallback.
4. Deny a later photo request and verify the error without replacing the current saved profile.
5. Verify no account, logout, cancellation, remote service, payment, or cloud wording appears.

- [ ] **Step 4: Commit docs, push, and create a stacked Draft PR**

Commit: `git add docs/DECISIONS.md docs/superpowers/plans/2026-07-22-local-profile-settings.md && git commit -m "docs: define local profile settings scope"`.

Push: `git push -u origin codex/local-profile-settings`.

PR: `gh pr create --draft --base codex/profile-memory-hub --head codex/local-profile-settings --title "feat: add local profile settings"`.

## Self-review

- The plan implements nickname, local avatar, explicit photo permission, profile-page identity, and a settings route; it keeps the existing travel archive behavior intact.
- All profile data uses the single local key `luyi.local-profile.v1`, so no `memories`, `memory_photos`, or `story_pages` schema is added or changed.
- The plan explicitly excludes accounts, logout, cancellation, network, remote media, payments, model SDKs, image analysis, cloud sync, and real NFC.
