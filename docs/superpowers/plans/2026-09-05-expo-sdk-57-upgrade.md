# Expo SDK 57 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade OneTapReality from Expo SDK 54 to stable Expo SDK 57 so the project runs with the team's updated Expo Go clients.

**Architecture:** Keep the existing managed/CNG Expo application structure and update only the runtime/toolchain declarations, Expo-compatible dependencies, lockfile, and compatibility fixes required by SDK 57. Preserve all local-first, staging-isolation, NFC, and server behavior.

**Tech Stack:** Expo SDK 57, React Native 0.86, React 19.2.3, Expo Router, npm, Jest, TypeScript

---

### Task 1: Record the upgrade boundary

**Files:**
- Modify: `docs/DECISIONS.md`
- Modify: `docs/superpowers/plans/2026-09-05-expo-sdk-57-upgrade.md`

- [ ] **Step 1:** Record SDK 57, Node 22.13, CNG, and unchanged product/security scope in `docs/DECISIONS.md`.
- [ ] **Step 2:** Confirm there are no checked-in `ios/` or `android/` directories, so no native regeneration is required in this checkout.

### Task 2: Upgrade Expo-compatible dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.github/workflows/quality-gate.yml`
- Modify: supporting configuration only if Expo diagnostics require it

- [ ] **Step 1:** Raise the declared minimum Node version to `22.13.0` in package and CI configuration.
- [ ] **Step 2:** Run `npx expo install expo@^57.0.0 --fix` using Node 22.13 or newer.
- [ ] **Step 3:** Run `npx expo-doctor@latest` and address concrete SDK 57 compatibility findings without adding product scope.
- [ ] **Step 4:** Inspect the dependency/config diff and confirm `expo` is at least `57.0.17`, React Native is 0.86, React is 19.2.3, and both lockfiles remain synchronized as required.

### Task 3: Verify clean installation and release gates

**Files:**
- Modify: compatibility files only when a failing gate demonstrates the need

- [ ] **Step 1:** Run `npm ci` from the updated lockfile.
- [ ] **Step 2:** Run `npm run lint`.
- [ ] **Step 3:** Run `npm run typecheck`.
- [ ] **Step 4:** Run `npm run test:ci`.
- [ ] **Step 5:** Run `npm run build:server`.
- [ ] **Step 6:** Run `npm run check:lockfile` and a final `npx expo-doctor@latest`.
- [ ] **Step 7:** Review `git diff` and report any remaining warnings or environment prerequisites.
