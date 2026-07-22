# Draft Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a locally persisted draft lifecycle so a generated travel memory can later be confirmed or discarded without treating it as a saved memory first.

**Architecture:** Add an optional `status` field to the existing `Memory` type so existing producers remain source-compatible. The SQLite migration adds a non-null `status` column with a `saved` default, and the repository exposes status-scoped reads plus parameterized transitions. This issue deliberately does not wire the lifecycle into routes or the memories provider; later UI work will call these repository APIs.

**Tech Stack:** TypeScript strict mode, Expo SQLite, Jest with jest-expo.

---

### Task 1: Define lifecycle types and repository test double

**Files:**
- Modify: `src/types/memory.ts`
- Create: `__tests__/memory-repository.test.ts`

- [x] **Step 1: Write the failing lifecycle tests**

```ts
import {
  createDraft,
  discardDraft,
  getDraft,
  listMemories,
  saveDraft,
} from "../src/storage/memory-repository";

it("keeps a newly created draft out of the saved memory list", async () => {
  const db = createMemoryDatabase();
  await createDraft(db, draftMemory);

  await expect(listMemories(db)).resolves.toEqual([]);
  await expect(getDraft(db, draftMemory.id)).resolves.toMatchObject({ status: "draft" });
});

it("confirms a draft as saved and discards an unconfirmed draft", async () => {
  const db = createMemoryDatabase();
  await createDraft(db, draftMemory);
  await saveDraft(db, draftMemory.id, "2026-07-22T10:01:00.000Z");
  await expect(listMemories(db)).resolves.toHaveLength(1);

  await createDraft(db, { ...draftMemory, id: "discard-me" });
  await discardDraft(db, "discard-me", "2026-07-22T10:02:00.000Z");
  await expect(getDraft(db, "discard-me")).resolves.toBeNull();
});
```

- [x] **Step 2: Run the focused test to verify the expected RED failure**

Run: `npm.cmd run test:ci -- memory-repository.test.ts`

Expected: the test suite fails because `createDraft`, `getDraft`, `saveDraft`, and `discardDraft` are not exported.

- [x] **Step 3: Add the type-only lifecycle vocabulary**

```ts
export const memoryStatuses = ["draft", "saved", "discarded"] as const;
export type MemoryStatus = (typeof memoryStatuses)[number];

export type Memory = MemoryDraftInput & {
  id: string;
  status?: MemoryStatus;
  pages: StoryPage[];
  createdAt: string;
  updatedAt: string;
};
```

- [x] **Step 4: Run TypeScript before adding storage behavior**

Run: `npm.cmd run typecheck`

Expected: PASS; existing `createMemory` remains compatible because `status` is optional at this migration boundary.

### Task 2: Migrate stored rows and implement parameterized lifecycle transitions

**Files:**
- Modify: `src/storage/memory-repository.ts`
- Test: `__tests__/memory-repository.test.ts`

- [x] **Step 1: Extend the failing tests for legacy migration**

```ts
it("reads rows created before the lifecycle migration as saved", async () => {
  const db = createLegacyMemoryDatabase();
  await migrateDbIfNeeded(db);

  await expect(listMemories(db)).resolves.toMatchObject([
    { id: "legacy-memory", status: "saved" },
  ]);
});
```

- [x] **Step 2: Run the focused test to verify the migration is missing**

Run: `npm.cmd run test:ci -- memory-repository.test.ts`

Expected: FAIL because legacy rows have no stored or hydrated `status`.

- [x] **Step 3: Implement minimal migration and repository APIs**

```ts
await db.execAsync(
  "ALTER TABLE memories ADD COLUMN status TEXT NOT NULL DEFAULT 'saved'"
);

export async function createDraft(db: SQLiteDatabase, memory: Memory) {
  await insertMemory(db, { ...memory, status: "draft" });
}

export async function saveDraft(db: SQLiteDatabase, id: string, updatedAt: string) {
  await db.runAsync(
    "UPDATE memories SET status = ?, updatedAt = ? WHERE id = ? AND status = ?",
    "saved",
    updatedAt,
    id,
    "draft"
  );
}
```

Implement `discardDraft` with the same parameter-binding discipline, and only return `status = 'saved'` memories from `listMemories`. Make migrations idempotent by checking the table columns with `PRAGMA table_info(memories)` before adding `status`.

- [x] **Step 4: Run focused tests to verify GREEN**

Run: `npm.cmd run test:ci -- memory-repository.test.ts`

Expected: PASS with draft isolation, confirmation, discard, and legacy-migration coverage.

### Task 3: Verify repository quality and commit the isolated issue

**Files:**
- Modify: `src/types/memory.ts`
- Modify: `src/storage/memory-repository.ts`
- Create: `__tests__/memory-repository.test.ts`

- [x] **Step 1: Run the required project gates**

Run: `npm.cmd run lint; npm.cmd run typecheck; npm.cmd run test:ci`

Expected: all commands exit with code 0.

- [x] **Step 2: Inspect scope before committing**

Run: `git diff --check; git status --short`

Expected: only the three implementation/test files and this plan are changed; no route, provider, AI, network, or NFC file is touched.

- [x] **Step 3: Commit the completed issue**

Run: `git add src/types/memory.ts src/storage/memory-repository.ts __tests__/memory-repository.test.ts docs/superpowers/plans/2026-07-22-draft-lifecycle.md; git commit -m "feat: add memory draft lifecycle"`

Expected: one commit containing only Issue #2 implementation and its plan.
