# Node and npm Version Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce Node 20 and npm 10.8.2 consistently for local development, Railway builds, and future CI.

**Architecture:** `package.json` remains the single source of toolchain constraints. Railpack consumes `engines.node` and `packageManager`, while npm consumes `devEngines` before install, ci, and run commands; a repository test prevents these declarations from drifting.

**Tech Stack:** Node.js 20, npm 10.8.2, Jest, Railway Railpack

---

### Task 1: Record the Toolchain Decision

**Files:**
- Modify: `docs/DECISIONS.md`

- [ ] **Step 1: Add the decision**

Record that Node is limited to `>=20.16.0 <21`, npm is fixed at `10.8.2`, and no duplicate `.nvmrc`, Railpack command, or Railway variable is introduced.

- [ ] **Step 2: Review the scope**

Confirm the entry states that dependencies, API behavior, database behavior, and application runtime behavior are unchanged.

### Task 2: Add a Failing Configuration Test

**Files:**
- Create: `__tests__/toolchain-config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import packageJson from "../package.json";

describe("Node and npm toolchain policy", () => {
  it("keeps Railway, npm, and contributor constraints aligned", () => {
    expect(packageJson.packageManager).toBe("npm@10.8.2");
    expect(packageJson.engines.node).toBe(">=20.16.0 <21");
    expect(packageJson.devEngines).toEqual({
      runtime: {
        name: "node",
        version: ">=20.16.0 <21",
        onFail: "error",
      },
      packageManager: {
        name: "npm",
        version: "10.8.2",
        onFail: "error",
      },
    });
  });
});
```

- [ ] **Step 2: Verify the test fails**

Run:

```powershell
npx --yes npm@10.8.2 exec -- jest --runInBand --runTestsByPath __tests__/toolchain-config.test.ts
```

Expected: FAIL because `engines.node` has no upper bound and `devEngines` is absent.

### Task 3: Enforce the Toolchain

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the minimal configuration**

Set:

```json
"packageManager": "npm@10.8.2",
"engines": {
  "node": ">=20.16.0 <21"
},
"devEngines": {
  "runtime": {
    "name": "node",
    "version": ">=20.16.0 <21",
    "onFail": "error"
  },
  "packageManager": {
    "name": "npm",
    "version": "10.8.2",
    "onFail": "error"
  }
}
```

- [ ] **Step 2: Verify the focused test passes**

Run:

```powershell
npx --yes npm@10.8.2 exec -- jest --runInBand --runTestsByPath __tests__/toolchain-config.test.ts
```

Expected: PASS.

### Task 4: Document Recovery and Verify

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document mismatch recovery**

Explain that `EBADDEVENGINES` means the active Node or npm version is outside policy, and provide:

```powershell
node --version
npm --version
npx --yes npm@10.8.2 ci
```

- [ ] **Step 2: Run the full verification**

Run:

```powershell
npx --yes npm@10.8.2 ci --ignore-scripts --no-audit --no-fund
npm run lint
npm run typecheck
npm run test:ci
npm run build:server
npx expo-doctor
```

Expected: all commands exit with status 0; Jest reports all suites passing and Expo Doctor reports all checks passing.

- [ ] **Step 3: Commit and update PR #41**

Commit the implementation, push `codex/pin-npm-version`, and verify PR #41 remains mergeable.
