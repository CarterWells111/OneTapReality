# Production API Origin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make EAS production builds connect to the deployed Railway API while preserving local relative API routing.

**Architecture:** `eas.json` owns the production build-time public origin. Existing `app.config.ts` injects that value into Expo Router and the existing API client reads the same variable; no server credential enters the client profile.

**Tech Stack:** Expo SDK 54, EAS Build configuration, Jest, TypeScript.

---

### Task 1: Lock the production profile contract

**Files:**
- Create: `__tests__/eas-config.test.ts`
- Create: `eas.json`

- [x] **Step 1: Write the failing test**

Create `__tests__/eas-config.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";

describe("EAS production configuration", () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "eas.json"), "utf8"),
  ) as {
    build: {
      production: {
        env: Record<string, string>;
      };
    };
  };

  it("points production builds at the Railway API", () => {
    expect(config.build.production.env.EXPO_PUBLIC_API_ORIGIN).toBe(
      "https://onetapserver-production.up.railway.app",
    );
  });

  it("does not expose server credentials", () => {
    expect(config.build.production.env).not.toHaveProperty("DATABASE_URL");
    expect(config.build.production.env).not.toHaveProperty("DEVICE_TOKEN_PEPPER");
  });
});
```

- [x] **Step 2: Run the focused test and verify red**

Run:

```bash
npm run test:ci -- --runTestsByPath __tests__/eas-config.test.ts
```

Expected: FAIL because `eas.json` does not exist.

- [x] **Step 3: Add the minimal EAS configuration**

Create `eas.json`:

```json
{
  "cli": {
    "version": ">= 16.0.1"
  },
  "build": {
    "production": {
      "env": {
        "EXPO_PUBLIC_API_ORIGIN": "https://onetapserver-production.up.railway.app"
      }
    }
  }
}
```

- [x] **Step 4: Run focused configuration tests**

Run:

```bash
npm run test:ci -- --runTestsByPath __tests__/eas-config.test.ts __tests__/app-config.test.ts
```

Expected: both suites PASS.

### Task 2: Document production builds and deployment state

**Files:**
- Modify: `README.md`
- Modify: `docs/EXECUTION-CHECKLIST.md`

- [x] **Step 1: Update README**

Replace the placeholder production origin with the deployed Railway URL. Document:

```bash
npx eas-cli@latest build -p ios --profile production
npx eas-cli@latest build -p android --profile production
```

State that `production` reads the committed public origin from `eas.json`, while local development keeps the origin empty. Keep the manual verification path “设置 → 后端实验 → 检查后端连接”.

- [x] **Step 2: Update execution checklist**

Mark Railway PostgreSQL, API variables, public domain, production pepper, deployment migration, and smoke verification complete. Keep a separate unchecked item for testing an installed production native build against Railway.

- [x] **Step 3: Run project checks**

Run:

```bash
npm run lint
npm run typecheck
npm run test:ci
```

Expected: all commands exit 0.

- [x] **Step 4: Verify Expo public configuration**

Run:

```powershell
$env:EXPO_PUBLIC_API_ORIGIN='https://onetapserver-production.up.railway.app'
npx expo config --type public
Remove-Item Env:EXPO_PUBLIC_API_ORIGIN
```

Expected: Expo Router configuration includes the Railway origin and no server credential.

- [x] **Step 5: Commit**

```bash
git add eas.json __tests__/eas-config.test.ts README.md docs/EXECUTION-CHECKLIST.md docs/superpowers/plans/2026-07-23-production-api-origin.md
git commit -m "build: configure Railway API for production"
```
