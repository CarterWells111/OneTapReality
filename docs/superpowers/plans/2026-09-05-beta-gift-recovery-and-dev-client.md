# Beta Gift Recovery and Development Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the staging NFC initialization and gift-binding flow in an in-place TestFlight Beta update, then add a separately installable staging Development Build that reads the same cloud gifts without sharing or syncing either app's local albums.

**Architecture:** A build-time `APP_VARIANT` registry is the single source for native identity, environment origins, release audience, associated domains, and runtime public build metadata. Metro selects internal activation and development-link modules at bundle time. Beta remains the sole staging Universal Link receiver; the Development Build uses a strict, development-only staging link input while both clients use the same staging API and server-side gift/version identities.

**Tech Stack:** Expo SDK 57, Expo Router, React Native, EAS Build profiles, Metro resolver, Jest/Testing Library, Drizzle ORM, pg-mem PostgreSQL, existing private R2 publication contract.

---

## Execution guardrails

- Work from an isolated worktree based on the latest local `origin/main`; do not modify or clean the current dirty SDK/admin-card checkout.
- Before functional code, add the approved dual-app decision to `docs/DECISIONS.md`.
- Preserve `com.onereality.onetapreality`, `luyi.db`, SecureStore key names, and photo-directory rules for the TestFlight Beta.
- Do not run EAS Build, EAS Submit, App Store Connect actions, DNS/AASA changes, deployments, migrations, or staging/production writes in phase one.
- Follow test-first development, but run tests in two concentrated batches: the affected target suites after implementation, then the final repository-wide gates.

### Task 1: Establish the isolated baseline and validated build-variant source

**Files:**

- Create: `scripts/build-variants.cjs`
- Create: `scripts/run-expo-with-variant.cjs`
- Modify: `app.config.ts`
- Modify: `eas.json`
- Modify: `metro.config.js`
- Modify: `package.json`
- Modify: `scripts/metro-activate-entry-resolver.cjs`
- Modify: `docs/DECISIONS.md`
- Test: `__tests__/build-variants.test.ts`
- Test: `__tests__/app-config.test.ts`
- Test: `__tests__/eas-config.test.ts`
- Test: `__tests__/metro-config.test.ts`

- [ ] **Step 1: Create an isolated worktree without touching the dirty checkout**

Run from `C:\Users\carte\Documents\AdventureX`:

```powershell
git worktree add .worktrees/beta-gift-recovery-and-dev-client -b codex/beta-gift-recovery-and-dev-client origin/main
```

Expected: a new clean worktree at `C:\Users\carte\Documents\AdventureX\.worktrees\beta-gift-recovery-and-dev-client` whose `HEAD` equals the current local `origin/main`. All remaining commands run there.

- [ ] **Step 2: Record the approved scope before functional code**

Prepend this decision to `docs/DECISIONS.md`:

```markdown
## 2026-09-05：Beta 礼品恢复与独立 Development Build 并存

现有外部 TestFlight Beta 的 `/activate` 占位页继续属于 external/public 构建边界；管理员 NFC 初始化只进入获准的 staging 内部构建。通过保持 `com.onereality.onetapreality`、`luyi.db`、SecureStore 键和本地照片目录规则不变的内部 TestFlight 构建原位更新 Beta，以恢复 staging 初始化、认领和主动发布；不得删除 App、迁移或覆盖现有本地旅行册。

- Development Build 使用 `OneTapReality Dev`、`com.onereality.onetapreality.dev` 与 `onetapreality-dev`，只连接与 Beta 相同的 staging API、PostgreSQL 和私有媒体存储；两个 Bundle ID 的 SQLite、SecureStore、照片目录和登录 session 各自独立，不复制本地数据。
- staging Universal Link 暂只由 Beta 接收。Development Build 使用构建级隔离的 staging 礼品链接输入入口，严格复用登录、成员、礼品状态和服务端权限校验；未来独立开发域名/AASA 需另行批准。
- 普通旅行册继续默认仅保存在本机。只有用户明确发布到已绑定礼品时才上传共享快照和所选照片；不增加自动云同步。
- production 不包含开发入口或 staging 配置。EAS 构建、TestFlight 提交、App Store Connect、DNS/AASA 和任何云端写操作继续逐项审批。
```

- [ ] **Step 3: Write the failing build-variant tests**

Create `__tests__/build-variants.test.ts` with assertions for the complete public contract:

```ts
const { resolveBuildVariant } = require("../scripts/build-variants.cjs");

describe("validated iOS build variants", () => {
  it("keeps the staging TestFlight Beta on the existing identity", () => {
    expect(resolveBuildVariant("staging-testflight")).toEqual(expect.objectContaining({
      appName: "OneTapReality",
      bundleIdentifier: "com.onereality.onetapreality",
      scheme: "onetapreality",
      environmentId: "staging",
      apiOrigin: "https://api-staging.onetapreality.com",
      giftUrlOrigin: "https://staging.onetapreality.com",
      releaseAudience: "internal",
      associatedDomains: ["applinks:staging.onetapreality.com"],
    }));
  });

  it("creates a separately installable staging Development Build", () => {
    expect(resolveBuildVariant("development-staging")).toEqual(expect.objectContaining({
      appName: "OneTapReality Dev",
      bundleIdentifier: "com.onereality.onetapreality.dev",
      scheme: "onetapreality-dev",
      environmentId: "staging",
      buildType: "development",
      apiOrigin: "https://api-staging.onetapreality.com",
      giftUrlOrigin: "https://staging.onetapreality.com",
      releaseAudience: "internal",
      associatedDomains: [],
    }));
  });

  it("keeps production free of staging and development identity", () => {
    const production = resolveBuildVariant("production");
    expect(JSON.stringify(production)).not.toContain("staging");
    expect(JSON.stringify(production)).not.toContain("onetapreality.dev");
    expect(production).toEqual(expect.objectContaining({
      bundleIdentifier: "com.onereality.onetapreality",
      environmentId: "production",
      apiOrigin: "https://api.onetapreality.com",
      giftUrlOrigin: "https://onetapreality.com",
      releaseAudience: "public",
    }));
  });

  it("rejects missing and unknown variants", () => {
    expect(() => resolveBuildVariant(undefined)).toThrow("APP_VARIANT is required");
    expect(() => resolveBuildVariant("preview-ish")).toThrow("Unsupported APP_VARIANT");
  });
});
```

Extend `__tests__/app-config.test.ts`, `__tests__/eas-config.test.ts`, and `__tests__/metro-config.test.ts` to assert:

```ts
expect(resolveAppConfig(baseConfig, "development-staging").ios.bundleIdentifier)
  .toBe("com.onereality.onetapreality.dev");
expect(resolveAppConfig(baseConfig, "staging-testflight").ios.bundleIdentifier)
  .toBe("com.onereality.onetapreality");
expect(eas.build.development).toEqual(expect.objectContaining({
  developmentClient: true,
  distribution: "internal",
  env: { APP_VARIANT: "development-staging" },
}));
expect(eas.build["staging-testflight"].env).toEqual({ APP_VARIANT: "staging-testflight" });
expect(eas.build.production.env).toEqual({ APP_VARIANT: "production" });
```

Metro tests must expect the internal activation module for `staging-testflight` and `development-staging`, and the public placeholder for `external-beta-staging` and `production`.

- [ ] **Step 4: Run the configuration tests and confirm RED**

Run:

```powershell
npm exec -- jest --runInBand --runTestsByPath __tests__/build-variants.test.ts __tests__/app-config.test.ts __tests__/eas-config.test.ts __tests__/metro-config.test.ts
```

Expected: FAIL because `scripts/build-variants.cjs`, `resolveAppConfig`, and `APP_VARIANT` profile mappings do not yet exist.

- [ ] **Step 5: Implement the build-time registry and profile mapping**

Create `scripts/build-variants.cjs` with an immutable registry containing these exact variants:

```js
const BUILD_VARIANTS = Object.freeze({
  "development-staging": Object.freeze({
    appName: "OneTapReality Dev",
    bundleIdentifier: "com.onereality.onetapreality.dev",
    scheme: "onetapreality-dev",
    environmentId: "staging",
    environmentLabel: "STAGING",
    buildType: "development",
    buildLabel: "DEVELOPMENT · STAGING",
    apiOrigin: "https://api-staging.onetapreality.com",
    giftUrlOrigin: "https://staging.onetapreality.com",
    releaseAudience: "internal",
    associatedDomains: Object.freeze([]),
  }),
  "staging-testflight": Object.freeze({
    appName: "OneTapReality",
    bundleIdentifier: "com.onereality.onetapreality",
    scheme: "onetapreality",
    environmentId: "staging",
    environmentLabel: "STAGING",
    buildType: "testflight",
    buildLabel: "BETA · STAGING",
    apiOrigin: "https://api-staging.onetapreality.com",
    giftUrlOrigin: "https://staging.onetapreality.com",
    releaseAudience: "internal",
    associatedDomains: Object.freeze(["applinks:staging.onetapreality.com"]),
  }),
  "alpha-staging": Object.freeze({
    appName: "OneTapReality",
    bundleIdentifier: "com.onereality.onetapreality",
    scheme: "onetapreality",
    environmentId: "staging",
    environmentLabel: "STAGING",
    buildType: "internal",
    buildLabel: "ALPHA · STAGING",
    apiOrigin: "https://api-staging.onetapreality.com",
    giftUrlOrigin: "https://staging.onetapreality.com",
    releaseAudience: "internal",
    associatedDomains: Object.freeze(["applinks:staging.onetapreality.com"]),
  }),
  "external-beta-staging": Object.freeze({
    appName: "OneTapReality",
    bundleIdentifier: "com.onereality.onetapreality",
    scheme: "onetapreality",
    environmentId: "staging",
    environmentLabel: "STAGING",
    buildType: "external-beta",
    buildLabel: "BETA · STAGING",
    apiOrigin: "https://api-staging.onetapreality.com",
    giftUrlOrigin: "https://staging.onetapreality.com",
    releaseAudience: "external-beta",
    associatedDomains: Object.freeze(["applinks:staging.onetapreality.com"]),
  }),
  production: Object.freeze({
    appName: "OneTapReality",
    bundleIdentifier: "com.onereality.onetapreality",
    scheme: "onetapreality",
    environmentId: "production",
    environmentLabel: "PRODUCTION",
    buildType: "production",
    buildLabel: "PRODUCTION",
    apiOrigin: "https://api.onetapreality.com",
    giftUrlOrigin: "https://onetapreality.com",
    releaseAudience: "public",
    associatedDomains: Object.freeze(["applinks:onetapreality.com"]),
  }),
});

function resolveBuildVariant(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("APP_VARIANT is required");
  const variant = BUILD_VARIANTS[value.trim()];
  if (!variant) throw new Error(`Unsupported APP_VARIANT: ${value}`);
  return variant;
}

module.exports = { BUILD_VARIANTS, resolveBuildVariant };
```

Refactor `app.config.ts` to export `resolveAppConfig(config, variantName)`. It must apply the registry values to `name`, `scheme`, `ios.bundleIdentifier`, `ios.associatedDomains`, Expo Router `origin`, and `extra.buildEnvironment`. The default export calls it with `process.env.APP_VARIANT` and therefore fails closed if the variant is absent.

Update every `eas.json` build profile to pass one `APP_VARIANT` only:

```json
{
  "development": { "distribution": "internal", "developmentClient": true, "autoIncrement": true, "env": { "APP_VARIANT": "development-staging" } },
  "preview": { "distribution": "internal", "env": { "APP_VARIANT": "production" } },
  "alpha": { "distribution": "internal", "env": { "APP_VARIANT": "alpha-staging" } },
  "staging-testflight": { "distribution": "store", "environment": "preview", "autoIncrement": true, "env": { "APP_VARIANT": "staging-testflight" } },
  "beta-external": { "distribution": "store", "environment": "preview", "autoIncrement": true, "env": { "APP_VARIANT": "external-beta-staging" } },
  "production": { "autoIncrement": true, "env": { "APP_VARIANT": "production" } }
}
```

Remove `submit.development`, because an internal/ad-hoc Development Build is not submitted to the existing App Store Connect record. Preserve the existing staging TestFlight, external Beta, and production submit records.

Change Metro and the activation resolver to derive the release audience from `resolveBuildVariant(process.env.APP_VARIANT)`. Update package scripts that invoke Expo directly so `dev`/`ios` explicitly select `development-staging` and `build:server` explicitly selects `production` through a small `scripts/run-expo-with-variant.cjs` spawn wrapper; do not add a dependency.

- [ ] **Step 6: Run the configuration batch and commit**

Run the Step 4 command again.

Expected: all four suites PASS; the Development Build has a unique identity, staging TestFlight retains the old identity, every EAS profile is explicit, and unknown variants fail closed.

Commit only this phase:

```powershell
git add scripts/build-variants.cjs scripts/run-expo-with-variant.cjs app.config.ts eas.json metro.config.js package.json scripts/metro-activate-entry-resolver.cjs docs/DECISIONS.md __tests__/build-variants.test.ts __tests__/app-config.test.ts __tests__/eas-config.test.ts __tests__/metro-config.test.ts
git commit -m "config: define staging beta and development variants"
```

### Task 2: Expose validated runtime identity and development-only link entry

**Files:**

- Create: `src/config/build-environment.ts`
- Create: `src/components/build-environment-banner.tsx`
- Create: `src/features/gifts/development-gift-link-entry.tsx`
- Create: `src/features/gifts/development-gift-link-entry.development.tsx`
- Modify: `src/app/_layout.tsx`
- Modify: `src/app/(tabs)/index.tsx`
- Modify: `src/services/backend/api-client.ts`
- Modify: `src/features/gifts/developer-nfc-console.tsx`
- Modify: `src/features/diagnostics/local-diagnostics.ts`
- Modify: `src/services/nfc/gift-link-scanner.ts`
- Modify: `src/types/env.d.ts`
- Modify: `scripts/metro-activate-entry-resolver.cjs`
- Modify: `scripts/external-beta-surface-guards.cjs`
- Test: `__tests__/build-environment.test.ts`
- Test: `__tests__/root-layout.test.tsx`
- Test: `__tests__/development-gift-link-entry.test.tsx`
- Test: `__tests__/backend-client.test.ts`
- Test: `__tests__/developer-nfc-console.test.tsx`
- Test: `__tests__/local-diagnostics.test.ts`
- Test: `__tests__/gift-link-scanner.test.ts`
- Test: `__tests__/external-beta-surface-guards.test.ts`

- [ ] **Step 1: Write the failing runtime and module-isolation tests**

Add tests that inject the `extra.buildEnvironment` object produced by Task 1 and assert exact validation:

```ts
expect(parseBuildEnvironment({
  variant: "development-staging",
  environmentId: "staging",
  environmentLabel: "STAGING",
  buildType: "development",
  buildLabel: "DEVELOPMENT · STAGING",
  apiOrigin: "https://api-staging.onetapreality.com",
  giftUrlOrigin: "https://staging.onetapreality.com",
  bundleIdentifier: "com.onereality.onetapreality.dev",
  scheme: "onetapreality-dev",
})).toEqual(expect.objectContaining({ environmentId: "staging", buildType: "development" }));
```

The root-layout test must find visible text `DEVELOPMENT · STAGING` for a development environment and no banner for production. The development-link test must enter a 43-character staging token URL, press `打开 staging 礼品`, and expect navigation to `/gift/<token>`. It must reject production hosts and malformed paths without navigating.

Backend, NFC console, NFC scanner, and local-diagnostics tests must prove their environment fields come from the validated runtime object rather than `process.env`. Surface-guard tests must prove the production/external module graph resolves the no-op development entry and cannot import `.development.tsx`. Remove obsolete client declarations for `EXPO_PUBLIC_API_ORIGIN`, `EXPO_PUBLIC_GIFT_ORIGIN`, and `EXPO_PUBLIC_RELEASE_AUDIENCE` from `src/types/env.d.ts`; `APP_VARIANT` remains build-tool-only and is not a client runtime variable.

- [ ] **Step 2: Run the runtime/UI tests and confirm RED**

Run:

```powershell
npm exec -- jest --runInBand --runTestsByPath __tests__/build-environment.test.ts __tests__/root-layout.test.tsx __tests__/development-gift-link-entry.test.tsx __tests__/backend-client.test.ts __tests__/developer-nfc-console.test.tsx __tests__/gift-link-scanner.test.ts __tests__/local-diagnostics.test.ts __tests__/external-beta-surface-guards.test.ts
```

Expected: FAIL because runtime parsing, the banner, development entry, and Metro selection do not exist.

- [ ] **Step 3: Implement runtime validation and the persistent development banner**

In `src/config/build-environment.ts`, define the exact runtime type and reject missing, unknown, or cross-paired fields. Export `getBuildEnvironment()` reading only `Constants.expoConfig?.extra?.buildEnvironment`, plus `parseBuildEnvironment(value)` for tests. Do not inspect domains to infer `environmentId`.

Use the validated `apiOrigin` as the default in `BackendApiClient`. Use the same object to construct `createInternalNfcUrlPolicy({ apiOrigin, giftOrigin: giftUrlOrigin })` in `DeveloperNfcConsole`; retain dependency injection in tests. Use `giftUrlOrigin` as the scanner's default expected origin. Feed local diagnostics only the fixed `environmentId` enum and never include origins, tokens, URLs, photo URIs, or user content.

Add `BuildEnvironmentBanner` above the root `Stack`. It renders an accessible, text-complete orange/yellow bar only when `buildType === "development"`:

```tsx
<View accessibilityRole="header" style={styles.banner}>
  <Text style={styles.label}>DEVELOPMENT · STAGING</Text>
</View>
```

- [ ] **Step 4: Implement the bundle-isolated development link input**

The public `development-gift-link-entry.tsx` exports a component returning `null`. The `.development.tsx` module renders a local `TextInput` and button. On press it calls existing `parseGiftLink(rawValue, getBuildEnvironment().giftUrlOrigin)` and navigates only with the returned pathname:

```tsx
const parsed = parseGiftLink(value, environment.giftUrlOrigin);
router.push(parsed.pathname as never);
```

It does not persist or log the input. Place the base component on the home screen. Extend the Metro resolver so only `development-staging` maps the base module to `.development.tsx`; all other variants resolve the no-op module. Preserve the existing activation mapping: `staging-testflight`, `alpha-staging`, and `development-staging` use the internal activation entry; `external-beta-staging` and `production` use the public placeholder.

- [ ] **Step 5: Run the runtime/UI batch and commit**

Run the Step 2 command again.

Expected: all suites PASS; the banner and link input exist only in Development, origins come from validated build metadata, and production/external bundles resolve the no-op module.

Commit:

```powershell
git add src/config/build-environment.ts src/components/build-environment-banner.tsx src/features/gifts/development-gift-link-entry.tsx src/features/gifts/development-gift-link-entry.development.tsx src/app/_layout.tsx 'src/app/(tabs)/index.tsx' src/services/backend/api-client.ts src/features/gifts/developer-nfc-console.tsx src/features/diagnostics/local-diagnostics.ts src/services/nfc/gift-link-scanner.ts src/types/env.d.ts scripts/metro-activate-entry-resolver.cjs scripts/external-beta-surface-guards.cjs __tests__/build-environment.test.ts __tests__/root-layout.test.tsx __tests__/development-gift-link-entry.test.tsx __tests__/backend-client.test.ts __tests__/developer-nfc-console.test.tsx __tests__/gift-link-scanner.test.ts __tests__/local-diagnostics.test.ts __tests__/external-beta-surface-guards.test.ts
git commit -m "feat: add isolated staging development entry"
```

### Task 3: Restore login return paths and prove shared staging gift/version behavior

**Files:**

- Modify: `src/features/gifts/gift-entry.tsx`
- Test: `__tests__/gift-entry.test.tsx`
- Test: `__tests__/activate-route.test.tsx`
- Test: `__tests__/login-screen.test.tsx`
- Test: `__tests__/gift-owner-management.test.tsx`
- Create: `__tests__/dual-app-staging-gifts.test.ts`

- [ ] **Step 1: Write failing route and shared-state tests**

In `__tests__/gift-entry.test.tsx`, retain a router with both `push` and `replace`, then add:

```ts
it("preserves a bound gift token while sending a signed-out invitee to login", async () => {
  mockClient.getGiftEntryStatus.mockResolvedValue({ status: "bound" });
  render(<GiftEntry token="abc/with space" platform="native" />);
  fireEvent.press(await screen.findByText("登录后查看此纪念品"));
  expect(mockPush).toHaveBeenCalledWith(
    "/login?returnTo=%2Fgift%2Fabc%252Fwith%2520space",
  );
});
```

In `__tests__/activate-route.test.tsx`, run the internal entry selection and assert signed-out navigation is exactly `/login?returnTo=/activate`. In `__tests__/login-screen.test.tsx`, make the mocked `returnTo` configurable and assert successful verification calls `router.replace("/gift/<encoded-token>")` without truncating the token.

Create `__tests__/dual-app-staging-gifts.test.ts` using `createBackendTestDatabase()` and the real gift repository. The test creates one gift and one user, claims it, publishes version 1, reads the same `giftId`, `albumId`, and `version` as two logical clients, publishes version 2 from one client, and verifies the other reads the same album with version 2. A second test creates and activates a viewer, verifies read access, and verifies the existing publication authorization rejects that viewer before creating an upload session.

Use the real repository sequence:

```ts
await createGift(db, { id: "gift-1", tokenHash: "known", createdAt });
await claimGiftByTokenHash(db, "known", "owner@example.com", claimedAt);
await createGiftPublishSession(db, {
  id: "publish-1", giftId: "gift-1", ownerEmail: "owner@example.com",
  baseVersion: 0, createdAt, expiresAt,
  payload: { sourceMemoryId: "beta-local-memory", title: "Beta album", pages: [], media: [] },
});
const first = await completeGiftPublishSession(db, {
  sessionId: "publish-1", ownerEmail: "owner@example.com", now: completedAt,
});
const betaRead = await getSharedAlbumSnapshot(db, first!.albumId);
const developmentRead = await getSharedAlbumSnapshot(db, first!.albumId);
expect(developmentRead!.album).toEqual(expect.objectContaining({
  id: betaRead!.album.id,
  version: 1,
}));
```

The owner-management UI test must continue to prove that publishing occurs only after the user chooses a local memory and explicitly presses the publish action.

- [ ] **Step 2: Run the gift-flow tests and confirm RED**

Run:

```powershell
npm exec -- jest --runInBand --runTestsByPath __tests__/gift-entry.test.tsx __tests__/activate-route.test.tsx __tests__/login-screen.test.tsx __tests__/gift-owner-management.test.tsx __tests__/dual-app-staging-gifts.test.ts
```

Expected: the new bound-gift login test fails because the button is absent; any integration-fixture mistakes are corrected until the tests fail only for the missing behavior.

- [ ] **Step 3: Implement the minimal login-path correction**

In `GiftEntry`, show an explicit login action for both `unclaimed` and `bound` entry states. Preserve the current claim label for unclaimed gifts and use `登录后查看此纪念品` for bound gifts. Both actions navigate through the same already-encoded `returnTo`:

```tsx
{!session && (entryStatus === "unclaimed" || entryStatus === "bound") ? (
  <AppButton
    label={entryStatus === "unclaimed" ? "登录后绑定此纪念品" : "登录后查看此纪念品"}
    onPress={() => router.push(`/login?returnTo=${encodeURIComponent(returnTo)}` as never)}
  />
) : null}
```

Do not add automatic claim, automatic publication, local database changes, or token storage.

- [ ] **Step 4: Run the concentrated affected-suite regression and commit**

Run:

```powershell
npm exec -- jest --runInBand --runTestsByPath __tests__/build-variants.test.ts __tests__/app-config.test.ts __tests__/eas-config.test.ts __tests__/metro-config.test.ts __tests__/build-environment.test.ts __tests__/root-layout.test.tsx __tests__/development-gift-link-entry.test.tsx __tests__/backend-client.test.ts __tests__/developer-nfc-console.test.tsx __tests__/gift-link-scanner.test.ts __tests__/local-diagnostics.test.ts __tests__/external-beta-surface-guards.test.ts __tests__/gift-entry.test.tsx __tests__/activate-route.test.tsx __tests__/login-screen.test.tsx __tests__/gift-owner-management.test.tsx __tests__/gift-repository.test.ts __tests__/gift-editor-publish-api.test.ts __tests__/gift-owned-album-api.test.ts __tests__/dual-app-staging-gifts.test.ts
```

Expected: all affected suites PASS. The output must show no unexpected console errors or warnings.

Commit:

```powershell
git add src/features/gifts/gift-entry.tsx __tests__/gift-entry.test.tsx __tests__/activate-route.test.tsx __tests__/login-screen.test.tsx __tests__/gift-owner-management.test.tsx __tests__/dual-app-staging-gifts.test.ts
git commit -m "fix: recover staging gift login and shared version flow"
```

### Task 4: Harden preflight, document operations, and run final gates

**Files:**

- Modify: `scripts/check-ios-beta-readiness.cjs`
- Create: `scripts/check-ios-development-readiness.cjs`
- Modify: `scripts/release-ios-testflight.cjs`
- Modify: `package.json`
- Modify: `docs/operations/ALPHA-STAGING.md`
- Modify: `docs/operations/IOS-NFC-CARD-TEST.md`
- Modify: `docs/release/TESTFLIGHT-RELEASE.md`
- Create: `docs/operations/DUAL-IOS-STAGING-TEST.md`
- Test: `__tests__/ios-beta-readiness.test.ts`
- Create: `__tests__/ios-development-readiness.test.ts`
- Modify: `__tests__/release-ios-testflight.test.ts`
- Modify: `__tests__/team-coordination-docs.test.mjs`

- [ ] **Step 1: Write failing preflight and operations tests**

Extend the Beta preflight test to evaluate `staging-testflight` through `resolveAppConfig` and require the original Bundle ID, staging origins, staging associated domain, internal activation module, TAG-only NFC entitlement, and no server secrets.

Create the Development preflight test with this contract:

```ts
expect(checkIosDevelopmentReadiness(validDevelopmentInput())).toEqual({
  platform: "ios",
  profile: "development",
  variant: "development-staging",
  apiOrigin: "https://api-staging.onetapreality.com",
  giftUrlOrigin: "https://staging.onetapreality.com",
  bundleIdentifier: "com.onereality.onetapreality.dev",
  scheme: "onetapreality-dev",
  associatedDomains: [],
  developmentClient: true,
  distribution: "internal",
});
```

Add rejection cases for production origins, the production Bundle ID, the shared Beta scheme, a staging associated domain on Development, missing `developmentClient`, and any server-only secret. Update release-script tests so profile inspection resolves origins and audience from `APP_VARIANT` via `scripts/build-variants.cjs`; the release command must pass `APP_VARIANT` to Expo config evaluation and must no longer require the removed `EXPO_PUBLIC_*` fields.

Documentation tests must require the new runbook to state: update Beta without deleting it; record local album count before and after; Beta owns staging Universal Links; Development uses manual link input; both use the same staging backend; local containers are not copied; no ordinary-album sync; and every cloud/external action needs separate approval.

- [ ] **Step 2: Run the preflight/docs tests and confirm RED**

Run:

```powershell
npm exec -- jest --runInBand --runTestsByPath __tests__/ios-beta-readiness.test.ts __tests__/ios-development-readiness.test.ts __tests__/release-ios-testflight.test.ts
node --test __tests__/team-coordination-docs.test.mjs
```

Expected: FAIL because the Development preflight and dual-iOS runbook are absent and the Beta preflight still reads the old split environment fields.

- [ ] **Step 3: Implement preflight and runbook changes**

Refactor `check-ios-beta-readiness.cjs` to accept a profile name, resolve its `APP_VARIANT`, and validate the fully expanded app config. Add `check-ios-development-readiness.cjs` with the exact development contract above and the same forbidden-secret list as the Beta preflight. Refactor `release-ios-testflight.cjs` to resolve `apiOrigin`, `giftUrlOrigin`, and `releaseAudience` from the profile's validated `APP_VARIANT`, then invoke Expo config with that same `APP_VARIANT`; do not reconstruct or infer origins from profile names. Add this package script:

```json
"development:preflight:ios": "node scripts/check-ios-development-readiness.cjs"
```

Create `docs/operations/DUAL-IOS-STAGING-TEST.md` with four explicit sections:

1. pre-update Beta inventory and screenshot-free count record;
2. same-Bundle TestFlight update and post-update count comparison;
3. Beta staging initialization/binding/manual publication verification;
4. separate Development installation, same-account cloud read, role check, and cross-App version increment.

Update existing staging and release documents to point to this runbook and state that no external action is authorized by the repository changes.

- [ ] **Step 4: Run the final clean-install and repository gates**

First inspect the worktree:

```powershell
git status --short
git diff --check
```

Expected: only the intended Task 4 changes are uncommitted and `git diff --check` has no output.

Run the required final gates once:

```powershell
npm ci
npm run lint
npm run typecheck
npm run test:ci
npm run build:server
npm run beta:preflight:ios
npm run development:preflight:ios
```

Expected: every command exits `0`. `build:server` uses the explicit production variant; the two iOS preflights report different Bundle IDs and the same staging origins where required.

- [ ] **Step 5: Commit documentation/preflight and produce the phase-one report**

Commit:

```powershell
git add scripts/check-ios-beta-readiness.cjs scripts/check-ios-development-readiness.cjs scripts/release-ios-testflight.cjs package.json docs/operations/ALPHA-STAGING.md docs/operations/IOS-NFC-CARD-TEST.md docs/release/TESTFLIGHT-RELEASE.md docs/operations/DUAL-IOS-STAGING-TEST.md __tests__/ios-beta-readiness.test.ts __tests__/ios-development-readiness.test.ts __tests__/release-ios-testflight.test.ts __tests__/team-coordination-docs.test.mjs
git commit -m "docs: add dual iOS staging release gates"
```

The report must include:

- root cause: external Beta intentionally bundled the `/activate` placeholder introduced by `2fb3eb0`, while `83509bd` isolated the internal activation console;
- every modified file and commit SHA;
- target-suite and final-gate results;
- Beta in-place-update safety conditions: unchanged Bundle ID, `luyi.db`, SecureStore keys, photo rules, no deletion, and mandatory pre/post device count;
- Development Bundle ID `com.onereality.onetapreality.dev`;
- Beta and Development API origin `https://api-staging.onetapreality.com`;
- link strategy: Beta exclusively receives staging Universal Links; Development uses strict manual staging link input;
- external operations still awaiting individual approval: EAS TestFlight build, TestFlight submission/group assignment, device update and verification, EAS Development Build, installation, and staging physical-card tests.

Do not start any of those external operations from this plan execution.
