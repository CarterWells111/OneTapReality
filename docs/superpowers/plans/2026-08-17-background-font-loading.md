# Background Font Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the App immediately with a temporary system font while five local fonts load serially in the background with prioritized selection, dismissible progress, and retry.

**Architecture:** A global provider owns an injected serial loader queue and exposes resolved families to canvas consumers. Root routing never waits for font registration; canvas and picker consume provider state while saved StoryPage font IDs remain unchanged.

**Tech Stack:** React Native, Expo Font, React Context, Jest, React Native Testing Library.

---

### Task 1: Font registry and serial priority state

**Files:** `src/features/typography/fonts.ts`, new `src/features/typography/font-loading-state.ts`, new `__tests__/font-loading-state.test.ts`.

- [ ] Write tests for one-at-a-time loading, selected-font prioritization, completed-byte progress, failure continuation, and retry.
- [ ] Run the focused suite and confirm missing behavior RED.
- [ ] Implement the five-font registry and pure state transitions.
- [ ] Re-run the focused suite and confirm GREEN.

### Task 2: Provider, temporary family, and non-blocking root

**Files:** new `src/features/typography/font-loading-provider.tsx`; modify `src/app/_layout.tsx`, `src/features/canvas/canvas-page.tsx`, `src/features/canvas/canvas-element.tsx`; tests `__tests__/font-loading-provider.test.tsx`, `__tests__/root-layout.test.tsx`.

- [ ] Write tests proving RootLayout renders before fonts resolve and canvas text uses a system fallback until loaded.
- [ ] Run focused suites and confirm RED.
- [ ] Implement provider loading, remove root font gating, and resolve target families through context.
- [ ] Re-run focused suites and confirm GREEN.

### Task 3: Prioritized selection and dismissible progress

**Files:** modify `src/features/canvas/element-context-menu.tsx` and provider; new `__tests__/font-loading-ui.test.tsx`.

- [ ] Write tests proving selection saves the target ID, promotes loading, closes the banner without cancellation, updates after completion, and retries failure.
- [ ] Run the focused suite and confirm RED.
- [ ] Add the accessible progress banner and wire font selection to `requestFont`.
- [ ] Re-run the focused suite and confirm GREEN.

### Task 4: Verification

- [ ] Run typography/canvas/root focused suites.
- [ ] Run `npm run lint`, `npm run typecheck`, `npm run test:ci`, and `npm run build:server`.
- [ ] Run `git diff --check` and report without staging, committing, pushing, deploying, or starting a remote build.
