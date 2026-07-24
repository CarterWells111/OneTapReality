# OneTapReality Identifier Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove current `travel-memory` product identifiers from the NFC application and use `OneTapReality` / `onetapreality` consistently.

**Architecture:** Change only pre-release local build identifiers and user-visible permission text. Keep `com.onetapreality.app`, database data, server schema, and historic planning documents unchanged. The existing remote EAS project is external state and must be renamed or replaced in the Expo dashboard after the local configuration passes.

**Tech Stack:** Expo SDK 54, EAS Build, Jest, TypeScript.

---

### Task 1: Define and prove the new Expo identifiers

**Files:**
- Modify: `__tests__/app-config.test.ts`
- Modify: `__tests__/brand-copy.test.tsx`
- Modify: `app.json`
- Modify: `package.json`

- [x] **Step 1: Write failing configuration expectations**

Change the identifier assertions to:

```ts
expect(expo.slug).toBe("onetapreality");
expect(expo.scheme).toBe("onetapreality");
expect(expo.name).toBe("OneTapReality");
```

Add a package assertion that reads `package.json` and expects `name` to equal `onetapreality`.

- [x] **Step 2: Run the focused tests and verify failure**

Run:

```powershell
npm run test:ci -- --runTestsByPath __tests__/app-config.test.ts __tests__/brand-copy.test.tsx
```

Expected: failure because the current Expo slug, URI scheme, and package name still contain `travel-memory-demo` or `lvyidemo`.

- [x] **Step 3: Apply the minimal identifier rename**

Set the Expo configuration and npm package fields to:

```json
{
  "name": "OneTapReality",
  "slug": "onetapreality",
  "scheme": "onetapreality"
}
```

Set `package.json` to:

```json
{ "name": "onetapreality" }
```

Do not change `com.onetapreality.app`, storage keys, database names, or server-side data.

- [x] **Step 4: Re-run focused tests and Expo config validation**

Run:

```powershell
npm run test:ci -- --runTestsByPath __tests__/app-config.test.ts __tests__/brand-copy.test.tsx
npx expo config --json
```

Expected: both tests pass and Expo prints JSON configuration without parse errors.

### Task 2: Record the pre-release naming boundary

**Files:**
- Modify: `docs/DECISIONS.md`

- [x] **Step 1: Record the decision**

Add a dated decision stating that current product and build identifiers use `OneTapReality` / `onetapreality`; historical documents are retained as historical records; and the previously-created EAS project requires a manual remote rename or replacement.

- [x] **Step 2: Verify the active configuration has no current `travel-memory` identifiers**

Run:

```powershell
rg -n -i "travel-memory-demo|travel_memory|travelmemory" app.json package.json eas.json __tests__
```

Expected: no matches.
