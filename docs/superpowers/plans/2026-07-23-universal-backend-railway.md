# Universal Backend and Railway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide one-command Expo development, production-native origin configuration, and a Railway-ready Node host for exported Expo API Routes.

**Architecture:** Expo remains the only route framework. Development uses its integrated dev server; production uses an API-only export for `dist/server`, then an Express adapter hosts it on Railway while Drizzle migrations run before deployment.

**Tech Stack:** Expo Router SDK 54, expo-server, Express, Node.js, Railway Railpack, Turso/libSQL, Drizzle, Jest.

---

### Task 1: API origin contract

**Files:**
- Modify: `__tests__/backend-client.test.ts`
- Modify: `src/services/backend/api-client.ts`
- Create: `__tests__/app-config.test.ts`
- Create: `app.config.ts`

- [ ] Add failing tests proving explicit origins lose trailing slashes, missing origins retain relative URLs, and Expo Router receives the same production origin.
- [ ] Run `npm run test:backend -- --runTestsByPath __tests__/backend-client.test.ts __tests__/app-config.test.ts` and confirm missing exports/config fail.
- [ ] Export a small URL resolver from `api-client.ts` and add `withRouterOrigin` in `app.config.ts`; do not derive LAN IP manually.
- [ ] Re-run the two tests and confirm they pass.

### Task 2: Railway production server

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `server.cjs`
- Create: `railway.json`

- [ ] Install the Expo-compatible `expo-server`, plus Express, compression, and morgan runtime packages.
- [ ] Add `dev`, `build:server`, and `start:server` scripts. `build:server` runs `expo export --platform web --no-ssg`; `start:server` runs `node server.cjs`.
- [ ] Implement the official Express adapter pattern using `dist/client`, `dist/server`, compression, static serving, request logging, `0.0.0.0`, and `process.env.PORT || 3000`.
- [ ] Add Railway config with `npm run build:server`, `npm run db:migrate`, `npm run start:server`, and `/api/health`.
- [ ] Run a production export and start the server on a temporary local port.

### Task 3: Cross-platform backend verification

**Files:**
- Create: `__tests__/backend-smoke.test.ts`
- Create: `scripts/verify-backend.cjs`
- Modify: `package.json`

- [ ] Write a failing Jest test with an injected fetch implementation for health, registration, create, list, and delete.
- [ ] Confirm the test fails because `verifyBackend` does not exist.
- [ ] Implement `verifyBackend(origin, fetchImpl)` and a CLI entry that accepts the first argument or `BACKEND_API_ORIGIN`; never log the access token.
- [ ] Add `verify:backend` and include the smoke test in `test:backend`.
- [ ] Run the targeted test and confirm it passes.

### Task 4: Deployment documentation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Create: `docs/backend/RAILWAY.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/SECURITY.md`

- [ ] Document the single-process development model and remove the manual LAN-IP requirement for Expo Go development.
- [ ] Document the production-like local build/start/smoke flow.
- [ ] Document Railway variables, generated domain, healthcheck, migration behavior, and the post-deploy `EXPO_PUBLIC_API_ORIGIN` rebuild requirement.
- [ ] State that `PORT` is platform-provided and that secrets never use the `EXPO_PUBLIC_` prefix.

### Task 5: Final verification

**Files:**
- Verify all files above.

- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run test:ci`.
- [ ] Run `npm run db:check`.
- [ ] Run `npx expo-doctor`.
- [ ] Run `npm run build:server`, launch `PORT=3091 npm run start:server`, and run `npm run verify:backend -- http://127.0.0.1:3091`.
- [ ] Run `git diff --check` and inspect `git status --short --branch` without staging unrelated user files.
