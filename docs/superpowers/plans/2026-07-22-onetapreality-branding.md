# OneTapReality Brand Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the offline Expo application as `OneTapReality｜一触如初` and apply the approved archive-blue, terracotta, parchment, and soft-paper color system without changing product behavior or local data.

**Architecture:** Keep all visual values in the existing `colors` token object, so components consume semantic colors instead of new scattered literals. Update only user-facing brand copy and Expo display configuration; retain `travel-memory-demo`, `lvyidemo`, `luyi.db`, and all storage keys. Home and profile heroes receive the brand and slogan while preserving their current hierarchy and flows.

**Tech Stack:** Expo SDK 54, Expo Router 6, React Native, TypeScript strict mode, Jest Expo, React Native Testing Library.

---

## File structure

- Modify `src/components/ui.tsx`: semantic palette and optional warm button tone.
- Modify `src/app/(tabs)/index.tsx`: home brand name and slogan.
- Modify `src/app/(tabs)/profile.tsx`: compact brand name, slogan, and terracotta gift styling.
- Modify `src/components/profile-avatar.tsx`, `src/components/story-spread.tsx`, `src/components/photo-strip.tsx`, `src/components/gift-preview-card.tsx`, `src/features/canvas/canvas-page.tsx`: remove visible legacy green/warm-white literals in favor of semantic tokens.
- Modify `src/features/profile/local-profile.ts`: default nickname `一触如初用户`.
- Modify `app.json`: Expo display name and approved parchment backgrounds while preserving stable identifiers.
- Modify `README.md`: project heading and intro brand wording.
- Modify `docs/DECISIONS.md`: record the branding scope and identifier-compatibility choice.
- Create `__tests__/brand-palette.test.ts` and `__tests__/brand-copy.test.tsx`; update `__tests__/profile-screen.test.tsx` and profile tests whose expected default nickname changes.

### Task 1: Test and introduce the semantic brand palette

**Files:**
- Modify: `src/components/ui.tsx`
- Modify: `src/components/profile-avatar.tsx`
- Modify: `src/components/story-spread.tsx`
- Modify: `src/components/photo-strip.tsx`
- Modify: `src/components/gift-preview-card.tsx`
- Modify: `src/features/canvas/canvas-page.tsx`
- Test: `__tests__/brand-palette.test.ts`

- [ ] **Step 1: Write the failing palette test**

```ts
import { colors } from "../src/components/ui";

it("exposes the approved OneTapReality palette", () => {
  expect(colors.background).toBe("#F7F2EA");
  expect(colors.accent).toBe("#56708A");
  expect(colors.warmAccent).toBe("#B56B52");
  expect(colors.accentSoft).toBe("#FFF2CF");
});
```

- [ ] **Step 2: Verify it fails for the missing or old token values**

Run: `npm run test:ci -- brand-palette.test.ts`

Expected: FAIL because `warmAccent` is absent and the old palette values remain.

- [ ] **Step 3: Implement the palette and literal replacements**

```ts
export const colors = {
  background: "#F7F2EA",
  surface: "#FFFFFF",
  ink: "#26313E",
  muted: "#64707D",
  line: "#DED7CC",
  accent: "#56708A",
  warmAccent: "#B56B52",
  accentSoft: "#FFF2CF",
  danger: "#A33A33",
} as const;
```

Use `colors.warmAccent` for the existing gift card highlight and arrow; use `colors.accentSoft` for image placeholders and hero cards; replace `#FFFDF8` with the appropriate semantic parchment or soft-paper token. Do not change gesture, canvas layout, storage, router, or button behavior.

- [ ] **Step 4: Verify focused tests and static types**

Run: `npm run test:ci -- brand-palette.test.ts profile-avatar.test.tsx && npm run typecheck`

Expected: all commands exit 0.

- [ ] **Step 5: Commit the palette work**

Commit: `git add src/components/ui.tsx src/components/profile-avatar.tsx src/components/story-spread.tsx src/components/photo-strip.tsx src/components/gift-preview-card.tsx src/features/canvas/canvas-page.tsx __tests__/brand-palette.test.ts && git commit -m "feat: apply OneTapReality color system"`.

### Task 2: Test and apply brand name, slogan, and compatible app configuration

**Files:**
- Modify: `src/app/(tabs)/index.tsx`
- Modify: `src/app/(tabs)/profile.tsx`
- Modify: `src/features/profile/local-profile.ts`
- Modify: `app.json`
- Modify: `README.md`
- Modify: `docs/DECISIONS.md`
- Test: `__tests__/brand-copy.test.tsx`
- Modify: `__tests__/profile-screen.test.tsx`
- Modify: `__tests__/profile-provider.test.tsx`

- [ ] **Step 1: Write failing brand-copy and compatibility tests**

```tsx
it("shows the OneTapReality name and exact slogan on the memory home", () => {
  const screen = render(<MemoriesHomeScreen />);
  expect(screen.getByText("OneTapReality｜一触如初")).toBeTruthy();
  expect(screen.getByText("让每一次触碰，都回到故事最初的地方。")).toBeTruthy();
});

it("keeps Expo identity and local database identifiers stable", () => {
  const config = require("../app.json").expo;
  expect(config.name).toBe("OneTapReality｜一触如初");
  expect(config.slug).toBe("travel-memory-demo");
  expect(config.scheme).toBe("lvyidemo");
});
```

- [ ] **Step 2: Verify the tests fail for absent new copy and old display name**

Run: `npm run test:ci -- brand-copy.test.tsx`

Expected: FAIL because the home has no full new name or slogan and `app.json` still names the app `旅忆`.

- [ ] **Step 3: Implement the exact user-facing copy and configuration**

Home hero title must be `OneTapReality｜一触如初`, followed by the exact slogan `让每一次触碰，都回到故事最初的地方。`, then its current local-only explanation. Profile hero eyebrow becomes `一触如初 · 共同档案`; add the exact slogan as a supporting line without removing the user nickname, archive title, settings control, statistics, gift flow, privacy, NFC, or clear-data confirmation. Set `DEFAULT_LOCAL_PROFILE.nickname` to `一触如初用户`. Set `expo.name` to `OneTapReality｜一触如初`, Android adaptive-icon background and splash background to `#F7F2EA`, and update README heading/intro. Do not change slug, scheme, database name, storage keys, permission behavior, or any local-data schema.

- [ ] **Step 4: Record the scope decision**

Append a dated `docs/DECISIONS.md` entry stating that the visual rename deliberately retains the Expo slug, scheme, SQLite database, and storage keys for installed-demo compatibility, and that it adds no account, network, AI, NFC, payment, or migration behavior.

- [ ] **Step 5: Verify the focused UI and profile regression suite**

Run: `npm run test:ci -- brand-copy.test.tsx profile-screen.test.tsx profile-provider.test.tsx`

Expected: PASS; tests expect the new default `一触如初用户` and the exact slogan.

- [ ] **Step 6: Commit copy, config, and documentation**

Commit: `git add 'src/app/(tabs)/index.tsx' 'src/app/(tabs)/profile.tsx' src/features/profile/local-profile.ts app.json README.md docs/DECISIONS.md __tests__/brand-copy.test.tsx __tests__/profile-screen.test.tsx __tests__/profile-provider.test.tsx && git commit -m "feat: rename app as OneTapReality"`.

### Task 3: Complete visual, static, and Expo release verification

**Files:**
- Modify: `docs/superpowers/plans/2026-07-22-onetapreality-branding.md`

- [ ] **Step 1: Scan for unwanted legacy user-facing product references**

Run: `rg -n "旅忆" README.md app.json src __tests__`

Expected: no user-facing `旅忆` copy remains; only stable internal identifiers such as `luyi.db` or `luyi.local-profile.v1` may retain the legacy transliteration.

- [ ] **Step 2: Run full verification**

Run: `npm run lint && npm run typecheck && npm run test:ci && npx expo-doctor && npx expo export --platform ios --output-dir .expo-export`

Expected: every command exits 0. After confirming the iOS export, remove only the generated `.expo-export` directory.

- [ ] **Step 3: Manually check Expo Go**

1. Start `npx expo start --clear` and open in Expo Go.
2. Verify the app display name and parchment launch background.
3. Verify home shows the exact full name and slogan.
4. Verify profile shows the compact name/slogan, blue primary actions, terracotta gift emphasis, parchment background, and soft-paper highlights.
5. Create, edit, save, and reopen a travel memory to confirm no local data or flow changed.

- [ ] **Step 4: Commit the tracked verification plan and create a Draft PR**

Commit: `git add docs/superpowers/plans/2026-07-22-onetapreality-branding.md && git commit -m "docs: add OneTapReality branding plan"`.

Push: `git push -u origin codex/onetapreality-branding`.

PR: `gh pr create --draft --base main --head codex/onetapreality-branding --title "feat: rebrand app as OneTapReality"`.

## Self-review

- Task 1 covers all four supplied color values, central semantic tokens, and existing literal replacements without changing app behavior.
- Task 2 covers the full and compact names, the exact slogan, default profile name, Expo display configuration, README, compatibility identifiers, and a written scope decision.
- Task 3 covers legacy-copy scanning, static checks, Expo checks, iOS export cleanup, manual Expo Go acceptance, and the required new Draft PR.
- `OneTapReality｜一触如初`, `让每一次触碰，都回到故事最初的地方。`, `#56708A`, `#B56B52`, `#F7F2EA`, and `#FFF2CF` are used consistently; no placeholder language appears in this plan.
