# Railway PostgreSQL Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the undeployed Turso/libSQL server database with Railway PostgreSQL while preserving the Expo API contract, local SQLite app data, anonymous-device isolation, and Railway deployment flow.

**Architecture:** Production uses `pg.Pool` through `drizzle-orm/node-postgres` and a server-only `DATABASE_URL`. Tests use isolated `pg-mem` databases through the same node-postgres Drizzle adapter. The undeployed SQLite migration baseline is replaced by a generated PostgreSQL `0000_initial` baseline; Railway applies it in the existing pre-deploy phase.

**Tech Stack:** Expo Router API Routes, TypeScript, Drizzle ORM/Kit, node-postgres (`pg`), pg-mem, Jest, Railway PostgreSQL.

---

### Task 1: Lock PostgreSQL expectations in failing tests

**Files:**
- Modify: `__tests__/backend-db-client.test.ts`
- Modify: `__tests__/backend-routes.test.ts`
- Create: `__tests__/backend-migrations.test.ts`

- [ ] **Step 1: Replace the libSQL client test with a server configuration contract**

```ts
import { getDatabaseUrl } from "../src/server/db/client";

describe("server PostgreSQL configuration", () => {
  it("requires DATABASE_URL", () => {
    expect(() => getDatabaseUrl({})).toThrow("DATABASE_URL is required");
  });

  it("returns the configured PostgreSQL URL without exposing Turso variables", () => {
    expect(getDatabaseUrl({ DATABASE_URL: "postgresql://user:pass@host:5432/app" }))
      .toBe("postgresql://user:pass@host:5432/app");
  });
});
```

- [ ] **Step 2: Make the health route mock expose only PostgreSQL `execute`**

```ts
jest.mock("../src/server/db/client", () => ({
  getServerDatabase: jest.fn(() => ({ execute: jest.fn().mockResolvedValue([]) })),
}));
```

Add a second health test that makes `execute` reject and expects status `503` with code `database_unavailable`.

- [ ] **Step 3: Add an empty-database migration test**

```ts
import { sql } from "drizzle-orm";
import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";

it("applies the PostgreSQL baseline to an empty database", async () => {
  const { db, close } = createBackendTestDatabase();
  try {
    await migrateBackendDatabase(db);
    const result = await db.execute(sql`
      select table_name from information_schema.tables
      where table_schema = 'public'
      and table_name in ('devices', 'memories', 'memory_pages')
      order by table_name
    `);
    expect(result.rows.map((row) => row.table_name)).toEqual(["devices", "memories", "memory_pages"]);
  } finally {
    await close();
  }
});
```

- [ ] **Step 4: Run RED tests**

Run:

```bash
npx jest --runInBand __tests__/backend-db-client.test.ts __tests__/backend-routes.test.ts __tests__/backend-migrations.test.ts
```

Expected: FAIL because `getDatabaseUrl` is not exported, health still calls `run`, and the test database does not return `{ db, close }` or expose PostgreSQL `information_schema`.

- [ ] **Step 5: Commit the failing tests**

```bash
git add __tests__/backend-db-client.test.ts __tests__/backend-routes.test.ts __tests__/backend-migrations.test.ts
git commit -m "test: define PostgreSQL backend contract"
```

### Task 2: Replace database dependencies and schema

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/db/client.ts`
- Modify: `src/app/api/health+api.ts`

- [ ] **Step 1: Replace libSQL dependencies**

Run:

```bash
npm uninstall @libsql/client
npm install pg
npm install --save-dev @types/pg pg-mem
```

Expected: `@libsql/client` is absent; `pg` is in dependencies; `@types/pg` and `pg-mem` are in devDependencies.

- [ ] **Step 2: Convert schema to PostgreSQL**

Use `pgTable`, `text`, `integer`, `jsonb`, `index`, and `uniqueIndex` from `drizzle-orm/pg-core`. Preserve all table/column/index names and foreign-key cascades. Define `layoutJson` as:

```ts
layoutJson: jsonb("layout_json").$type<CloudMemoryPayload["pages"][number]["layout"]>(),
```

Import `CloudMemoryPayload` as a type from `src/services/backend/contracts.ts`.

- [ ] **Step 3: Implement the node-postgres client boundary**

```ts
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type BackendDatabase = NodePgDatabase<typeof schema>;
type DatabaseEnvironment = { DATABASE_URL?: string };

export function getDatabaseUrl(environment: DatabaseEnvironment = process.env): string {
  const url = environment.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required");
  return url;
}

export function createBackendDatabase(client: Pool): BackendDatabase {
  return drizzle({ client, schema });
}

let cachedDatabase: BackendDatabase | undefined;
export function getServerDatabase(): BackendDatabase {
  cachedDatabase ??= createBackendDatabase(new Pool({ connectionString: getDatabaseUrl() }));
  return cachedDatabase;
}
```

- [ ] **Step 4: Change health to PostgreSQL execute**

Replace `getServerDatabase().run(sql\`select 1\`)` with:

```ts
await getServerDatabase().execute(sql`select 1`);
```

- [ ] **Step 5: Run client and route tests**

Run:

```bash
npx jest --runInBand __tests__/backend-db-client.test.ts __tests__/backend-routes.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit driver and schema changes**

```bash
git add package.json package-lock.json src/server/db/schema.ts src/server/db/client.ts src/app/api/health+api.ts
git commit -m "feat: use PostgreSQL server driver"
```

### Task 3: Generate the PostgreSQL baseline and test database

**Files:**
- Modify: `drizzle.config.ts`
- Replace: `drizzle/0000_initial.sql`
- Replace: `drizzle/meta/0000_initial_snapshot.json`
- Replace: `drizzle/meta/_journal.json`
- Modify: `src/server/db/test-database.ts`
- Test: `__tests__/backend-migrations.test.ts`

- [ ] **Step 1: Configure Drizzle Kit for PostgreSQL**

```ts
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/onetapreality",
  },
  strict: true,
  verbose: true,
});
```

- [ ] **Step 2: Reset the undeployed migration baseline**

Delete the three old generated migration files listed above, then run:

```bash
npm run db:generate -- --name initial
```

Expected: a PostgreSQL `drizzle/0000_initial.sql` using quoted identifiers, foreign keys with `ON DELETE cascade`, and new PostgreSQL meta/journal files.

- [ ] **Step 3: Implement isolated pg-mem test databases**

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { newDb } from "pg-mem";
import type { Pool } from "pg";
import * as schema from "./schema";
import type { BackendDatabase } from "./client";

export function createBackendTestDatabase(): {
  db: BackendDatabase;
  close: () => Promise<void>;
} {
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = memory.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  return { db: drizzle({ client: pool, schema }), close: () => pool.end() };
}

export async function migrateBackendDatabase(db: BackendDatabase): Promise<void> {
  await migrate(db, { migrationsFolder: "./drizzle" });
}
```

- [ ] **Step 4: Run migration test**

Run:

```bash
npx jest --runInBand __tests__/backend-migrations.test.ts
```

Expected: PASS with all three application tables visible.

- [ ] **Step 5: Commit migration baseline**

```bash
git add drizzle.config.ts drizzle src/server/db/test-database.ts __tests__/backend-migrations.test.ts
git commit -m "feat: add PostgreSQL migration baseline"
```

### Task 4: Adapt repository behavior and integration tests

**Files:**
- Modify: `src/server/memories/repository.ts`
- Modify: `__tests__/backend-repository.test.ts`

- [ ] **Step 1: Expand the repository test before implementation**

Destructure `{ db, close }`, migrate inside the test, and close in `finally`. Add assertions that:

```ts
const updated = await updateMemory(db, "device-a", memory.id, {
  title: "Updated",
  city: "hangzhou",
  travelDate: "2026-07-23",
  status: "saved",
  photoCount: 0,
  pages: [],
});
expect(updated?.title).toBe("Updated");
expect(await db.select().from(memoryPages)).toEqual([]);
expect(await deleteMemory(db, "device-b", memory.id)).toBe(false);
expect(await deleteMemory(db, "device-a", memory.id)).toBe(true);
```

- [ ] **Step 2: Run repository RED test**

Run:

```bash
npx jest --runInBand __tests__/backend-repository.test.ts
```

Expected: FAIL because libSQL-specific `rowsAffected`, stringified JSON handling, or old test helper usage remains.

- [ ] **Step 3: Remove relational-query and libSQL-specific assumptions**

Use simple `select().from(...).where(...).limit(1)` for device and memory lookups. Store validated layout objects directly in `jsonb`. In hydration, pass a non-null layout object directly into `parseCloudMemoryPayload`.

Replace delete logic with:

```ts
const deleted = await db.delete(memories)
  .where(and(eq(memories.id, memoryId), eq(memories.deviceId, deviceId)))
  .returning({ id: memories.id });
return deleted.length > 0;
```

Do not explicitly delete `memory_pages`; the foreign key cascade owns that behavior.

- [ ] **Step 4: Update authentication lookup**

In `src/server/auth/device-auth.ts`, replace `db.query.devices.findFirst` with a simple select/limit query so production and pg-mem execute the same SQL shape.

- [ ] **Step 5: Run backend integration tests**

Run:

```bash
npm run test:backend
```

Expected: PASS for validation, auth, migration, repository, route, client, credential, screen, config, and smoke tests. Add `__tests__/backend-migrations.test.ts` to the `test:backend` script.

- [ ] **Step 6: Commit repository adaptation**

```bash
git add src/server/memories/repository.ts src/server/auth/device-auth.ts __tests__/backend-repository.test.ts package.json package-lock.json
git commit -m "feat: adapt backend repository to PostgreSQL"
```

### Task 5: Replace Turso configuration and documentation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/SECURITY.md`
- Modify: `docs/EXECUTION-CHECKLIST.md`
- Modify: `docs/backend/API.md`
- Modify: `docs/backend/MIGRATIONS.md`
- Modify: `docs/backend/RAILWAY.md`
- Modify: `docs/release/PRIVACY.md`
- Modify: `src/types/env.d.ts`

- [ ] **Step 1: Replace server environment variables**

Use this local example and retain the existing public origin explanation:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/onetapreality
DEVICE_TOKEN_PEPPER=replace-with-a-local-only-secret
PORT=3000
```

Remove `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` from environment typings.

- [ ] **Step 2: Update architecture, security, API, migration, privacy, and checklist docs**

State that Railway PostgreSQL is server-only, local SQLite remains authoritative, photos and local URIs are not uploaded, migration baseline was reset before first cloud deployment, and no CI was added.

- [ ] **Step 3: Update Railway setup instructions**

Document the exact API Service variables:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
DEVICE_TOKEN_PEPPER=<64-character-random-secret>
NODE_ENV=production
```

Document `+ New → Database → Add PostgreSQL`, the reference variable, pre-deploy migration, healthcheck, generated domain, smoke command, backups recommendation, and that `PORT` is not manually set.

- [ ] **Step 4: Verify no active Turso references remain**

Run:

```bash
rg -n "TURSO_DATABASE_URL|TURSO_AUTH_TOKEN|@libsql/client|drizzle-orm/libsql|dialect: \"turso\"" . --glob "!docs/superpowers/**"
```

Expected: no matches. Historical design/spec/plan files under `docs/superpowers` may retain context.

- [ ] **Step 5: Commit configuration and docs**

```bash
git add .env.example README.md docs src/types/env.d.ts
git commit -m "docs: document Railway PostgreSQL deployment"
```

### Task 6: Verify production bundle and full project

**Files:**
- No source files; this task is verification-only. If a command fails, stop and diagnose the failing boundary before changing code.

- [ ] **Step 1: Verify clean dependency installation**

Run:

```bash
npm ci
```

Expected: exit 0.

- [ ] **Step 2: Run static and database checks**

Run:

```bash
npm run lint
npm run typecheck
npm run db:check
```

Expected: all exit 0.

- [ ] **Step 3: Run the full test suite**

Run:

```bash
npm run test:ci
```

Expected: all suites and tests pass with zero failures.

- [ ] **Step 4: Build the Railway server bundle**

Run:

```bash
npm run build:server
```

Expected: Expo exports all five API routes and exits 0 without bundling `pg-mem` into runtime code.

- [ ] **Step 5: Run Expo Doctor**

Run:

```bash
npx expo-doctor
```

Expected: all checks pass.

- [ ] **Step 6: Review final diff**

Run:

```bash
git diff --check
git status --short
git diff --stat origin/main...HEAD
```

Expected: no whitespace errors, no credentials, no CI files, and only PostgreSQL migration scope.

### Task 7: Publish the migration branch

**Files:**
- No additional source changes expected.

- [ ] **Step 1: Commit any final verified adjustments**

Stage only PostgreSQL migration files and use a terse commit message describing the verified adjustment.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin codex/railway-postgresql
```

- [ ] **Step 3: Create a Draft PR to `main`**

Title: `Use Railway PostgreSQL for the backend`

The body must summarize the driver/schema/migration replacement, state that no cloud data existed, list Railway variables, explicitly note no CI addition, and include every verification result.
