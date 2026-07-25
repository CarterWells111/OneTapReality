# Railway Cron and Quality Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the API opt in to database migrations while the gift-maintenance Cron skips them, and restore the previously verified quality checks accidentally reverted from main.

**Architecture:** `railway.json` runs a small Node gate before deployment. Only a service with `RUN_DB_MIGRATIONS=true` invokes Drizzle; all other services exit successfully. Restore component accessibility and canvas behavior from the verified release baseline, and restore Expo FileSystem as a declared dependency.

**Tech Stack:** Railway/Railpack, Node CommonJS, Expo SDK 54, Jest, TypeScript.

---

### Task 1: Gate Railway database migration by service opt-in

**Files:**
- Create: `scripts/railway-predeploy.cjs`
- Create: `__tests__/railway-predeploy.test.ts`
- Modify: `railway.json`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/backend/RAILWAY.md`

- [ ] **Step 1: Write the failing tests**

```ts
expect(runRailwayPredeploy({ env: {}, execute })).toBe(0);
expect(execute).not.toHaveBeenCalled();
expect(runRailwayPredeploy({ env: { RUN_DB_MIGRATIONS: "true" }, execute })).toBe(0);
expect(execute).toHaveBeenCalledWith("npm", ["run", "db:migrate"], { stdio: "inherit" });
```

- [ ] **Step 2: Verify the tests fail because the module is absent**

Run: `npm.cmd run test:ci -- --runTestsByPath __tests__/railway-predeploy.test.ts`

- [ ] **Step 3: Add the minimum gate and point Railway to it**

```js
if (env.RUN_DB_MIGRATIONS !== "true") return 0;
return execute("npm", ["run", "db:migrate"], { stdio: "inherit" }).status ?? 1;
```

```json
"preDeployCommand": "node scripts/railway-predeploy.cjs"
```

- [ ] **Step 4: Verify the targeted test passes**

Run: `npm.cmd run test:ci -- --runTestsByPath __tests__/railway-predeploy.test.ts`

### Task 2: Restore verified UI behavior and tests

**Files:**
- Modify: `src/features/canvas/book-canvas-editor.tsx`
- Modify: `src/features/canvas/page-manager-sheet.tsx`
- Modify: `src/features/cities/city-map.tsx`
- Modify: `src/app/(tabs)/profile.tsx`
- Modify: `__tests__/demo-draft-generator.test.ts`
- Modify: `__tests__/metro-config.test.ts`

- [ ] **Step 1: Keep tests as the behavioral contract**

The restored contract is: canvas text selection exposes `完成` and text actions, the cover is not removed by page-management selection, city markers are interactive press targets, profile settings retain `打开设置`, every selected photo gets its own draft page, and Metro's subprocess program is valid JavaScript.

- [ ] **Step 2: Restore the minimal release-baseline implementations**

```tsx
setContextMenuMode("main");
setEditingElementId(nextId);
```

```tsx
<Pressable accessibilityLabel={savedMemoryLabel(marker.city, stat.visitCount)} accessibilityRole="button" />
```

```ts
expect(pages).toHaveLength(4);
expect(pages.map((page) => page.kind)).toEqual(["cover", "photo", "photo", "closing"]);
```

- [ ] **Step 3: Run the affected tests**

Run: `npm.cmd run test:ci -- --runTestsByPath __tests__/book-canvas-editor.test.tsx __tests__/canvas-page.test.tsx __tests__/page-manager-sheet.test.tsx __tests__/city-map.test.tsx __tests__/profile-settings-entry.test.tsx __tests__/demo-draft-generator.test.ts __tests__/metro-config.test.ts`

### Task 3: Restore the declared Expo FileSystem dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Confirm the failing import boundary**

`memory-detail-canvas.test.tsx` and `brand-copy.test.tsx` fail because `share-action-sheet.ts` imports `expo-file-system/legacy` but `expo-file-system` is absent from dependencies.

- [ ] **Step 2: Add the SDK-compatible dependency**

Run: `npx expo install expo-file-system`

- [ ] **Step 3: Reinstall from the lockfile and run the affected tests**

Run: `npm.cmd ci && npm.cmd run test:ci -- --runTestsByPath __tests__/memory-detail-canvas.test.tsx __tests__/brand-copy.test.tsx`

### Task 4: Verify and publish

**Files:**
- Verify only: all changed files

- [ ] **Step 1: Run repository quality commands**

Run: `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run test:ci`, `npm.cmd run build:server`, and `npm.cmd run db:check`.

- [ ] **Step 2: Commit and push the verified branch to `main`**

Run: `git add ... && git commit -m "fix: isolate Railway cron migrations and restore quality gates" && git push origin HEAD:main`

- [ ] **Step 3: Configure Railway**

Set `RUN_DB_MIGRATIONS=true` only on `OneTapServer`; leave it absent from `gift-maintenance-cron`, then redeploy both services.
