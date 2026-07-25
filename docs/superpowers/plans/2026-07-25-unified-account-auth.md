# Unified Account Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add passwordless account login so the app can identify users, NFC gift owners/viewers, and Railway allow-listed administrators through one session.

**Architecture:** PostgreSQL gains canonical users, one-time codes, and sessions while existing gift members remain email invitations. Expo Router gets an AuthProvider and login route; protected NFC routes redirect guests to login and server APIs derive authorization from the authenticated account and Railway allow-list.

**Tech Stack:** Expo Router, React Native, expo-secure-store, Expo API routes, Drizzle/PostgreSQL, Resend, Jest.

---

### Task 1: Canonical account persistence and migration

**Files:**
- Modify: `src/server/db/schema.ts`, `src/server/gifts/repository.ts`
- Create: `drizzle/0005_unified_accounts.sql`
- Test: `__tests__/account-repository.test.ts`, `__tests__/backend-migrations.test.ts`

- [ ] Write failing repository tests for create-or-get user by normalized email, one-use expired codes, active/revoked sessions, and logout revocation.
- [ ] Run `npm test -- --runInBand __tests__/account-repository.test.ts` and confirm the missing account repository API fails.
- [ ] Add `users`, `auth_email_codes`, and `auth_sessions` schema definitions with unique normalized email/token hashes and indexed account/email lookups; add the immutable SQL migration without removing legacy gift auth tables.
- [ ] Implement small account repository functions: create-or-get user, create/consume code, create/read/revoke session, and update last-login timestamp.
- [ ] Re-run the focused tests and migration checks; commit the green persistence unit.

### Task 2: Unified authentication service and API contracts

**Files:**
- Create: `src/server/auth/account-auth.ts`, `src/server/auth/session-auth.ts`
- Create: `src/app/api/auth/request+api.ts`, `src/app/api/auth/verify+api.ts`, `src/app/api/auth/me+api.ts`, `src/app/api/auth/logout+api.ts`
- Modify: `src/app/api/gift-auth/request+api.ts`, `src/app/api/gift-auth/verify+api.ts`, `src/server/gifts/session-auth.ts`, `src/services/backend/api-client.ts`
- Test: `__tests__/account-auth-api.test.ts`, `__tests__/gift-auth-compatibility.test.ts`, `__tests__/backend-client.test.ts`

- [ ] Write failing route tests for request rate limiting, verify creating a user/session, `me` returning email/admin status, logout invalidating the token, and legacy gift-auth issuing the same new session shape.
- [ ] Run the focused route tests and confirm they fail because `/api/auth/*` does not exist.
- [ ] Extract code hashing, email normalization, token issuance, and authenticated-user lookup into server auth modules; use existing `GIFT_AUTH_PEPPER`, Resend sender, and `GIFT_ADMIN_EMAILS` only on the server.
- [ ] Implement the four account routes and compatibility wrappers; add API client methods and typed `AuthenticatedUser` responses.
- [ ] Change gift/admin route authentication to obtain the unified user then authorize by user email; legacy `gift_sessions` tokens return unauthorized.
- [ ] Re-run focused API/client tests and commit the green API unit.

### Task 3: Client session state and login screen

**Files:**
- Create: `src/features/auth/auth-provider.tsx`, `src/features/auth/auth-storage.ts`, `src/app/login.tsx`
- Modify: `src/app/_layout.tsx`, `src/services/gifts/gift-credentials.ts`
- Test: `__tests__/auth-storage.test.ts`, `__tests__/auth-provider.test.tsx`, `__tests__/login-screen.test.tsx`

- [ ] Write failing tests for restoring a valid session, clearing an expired session, storing only the token/user display fields, and returning to a requested route after successful verification.
- [ ] Run the focused component tests and confirm they fail because AuthProvider and login route are missing.
- [ ] Implement SecureStore-backed auth storage and a single AuthProvider exposing loading state, current user, sign-in, sign-out, and `requireLogin(returnTo)`.
- [ ] Implement the two-step email/code login screen with resend, loading, validation, server error, and safe `returnTo` handling.
- [ ] Mount AuthProvider above existing local profile/memory providers; remove direct UI dependence on the old gift-only credential API while preserving its compatibility export if older routes require it.
- [ ] Re-run focused auth UI tests and commit the green client-auth unit.

### Task 4: Role-aware NFC and account entry points

**Files:**
- Modify: `src/features/gifts/gift-entry.tsx`, `src/features/gifts/developer-nfc-console.tsx`, `src/app/gifts/index.tsx`, `src/app/activate.tsx`, `src/app/(tabs)/profile.tsx`, `src/app/settings/index.tsx`
- Test: `__tests__/gift-entry.test.tsx`, `__tests__/developer-nfc-console.test.tsx`, `__tests__/my-gifts-screen.test.tsx`, `__tests__/profile-auth-entry.test.tsx`

- [ ] Write failing component tests for guest redirect to login, administrator console access, owner management state, viewer read-only state, unknown user denial, and logout leaving local profile data intact.
- [ ] Run focused tests and confirm current components still contain duplicate email-code flows or lack the account entry.
- [ ] Replace duplicate NFC console verification controls with AuthProvider state; protect `/activate`, gift entry, and owned gifts through one redirect helper.
- [ ] Add account status/login/logout affordances to profile and settings without uploading local avatar/profile fields.
- [ ] Re-run focused role/UI tests and commit the green integration unit.

### Task 5: Documentation, regression suite, and deployment readiness

**Files:**
- Modify: `docs/DECISIONS.md`, NFC privacy/support documentation that describes gift email sessions
- Test: relevant existing backend, app-config, and route suites

- [ ] Add the finalized decision and update user-facing privacy/support text to describe passwordless accounts, 30-day sessions, invite-by-email access, and local travel-book privacy.
- [ ] Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:ci`, and `npm run build:server`; record any pre-existing unrelated failures separately.
- [ ] Apply migration in a non-production Railway validation environment, verify `POST /api/auth/request`, `POST /api/auth/verify`, `GET /api/auth/me`, NFC owner/viewer access, administrator `/activate`, and logout.
- [ ] Commit documentation and verification changes; deploy only after Railway has the existing `GIFT_AUTH_PEPPER`, `GIFT_EMAIL_FROM`, `RESEND_API_KEY`, and `GIFT_ADMIN_EMAILS` values.
