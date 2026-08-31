# Gift Maintenance Worker Dual-Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing hourly Cloudflare Worker maintain production and external-Beta staging sequentially without adding a Worker, trigger, retry, paid binding, or secret to Git.

**Architecture:** The schedule-only Worker builds a fixed production-then-staging target list from four bindings. A target helper validates HTTPS and required bindings, sends one authenticated POST, cancels the response body, and emits only fixed sanitized failure codes. The orchestrator awaits both targets in order, records failures without suppressing the second request, and throws once after both attempts so existing Cron metrics report the invocation failure.

**Tech Stack:** TypeScript, Cloudflare Workers scheduled handler, Jest, Wrangler TOML and Wrangler dry-run.

---

## File structure

- Modify `__tests__/gift-maintenance-worker.test.ts`: executable behavior and configuration contract for both environments.
- Modify `workers/gift-maintenance/src/index.ts`: sequential target validation, delivery, response cleanup, and sanitized aggregate failure.
- Modify `workers/gift-maintenance/wrangler.toml`: commit only the non-secret staging endpoint while retaining one Cron and zero storage/queue bindings.
- Use the already committed `docs/DECISIONS.md` and `docs/superpowers/specs/2026-08-31-worker-dual-environment-maintenance-design.md` as the scope and security contract.

### Task 1: Specify dual-target success and failure behavior

**Files:**
- Modify: `__tests__/gift-maintenance-worker.test.ts`
- Test: `__tests__/gift-maintenance-worker.test.ts`

- [ ] **Step 1: Replace the single-target fixture with both environment bindings**

```ts
const environment = {
  MAINTENANCE_ENDPOINT: "https://api.example.com/api/internal/gift-maintenance",
  MAINTENANCE_SECRET: "production-secret",
  STAGING_MAINTENANCE_ENDPOINT: "https://api-staging.example.com/api/internal/gift-maintenance",
  STAGING_MAINTENANCE_SECRET: "staging-secret",
};
```

- [ ] **Step 2: Write the failing ordered-delivery test**

```ts
it("maintains production then staging with isolated secrets", async () => {
  const cancelProduction = jest.fn();
  const cancelStaging = jest.fn();
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce(new Response(new ReadableStream({ cancel: cancelProduction }), { status: 200 }))
    .mockResolvedValueOnce(new Response(new ReadableStream({ cancel: cancelStaging }), { status: 204 }));

  await runScheduledMaintenance(environment, fetcher);

  expect(fetcher.mock.calls).toEqual([
    [environment.MAINTENANCE_ENDPOINT, {
      method: "POST",
      headers: { "x-gift-maintenance-secret": environment.MAINTENANCE_SECRET },
    }],
    [environment.STAGING_MAINTENANCE_ENDPOINT, {
      method: "POST",
      headers: { "x-gift-maintenance-secret": environment.STAGING_MAINTENANCE_SECRET },
    }],
  ]);
  expect(cancelProduction).toHaveBeenCalledTimes(1);
  expect(cancelStaging).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: Write failing continuation and sanitization tests**

```ts
it("still maintains staging when production returns an HTTP failure", async () => {
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce(new Response("private upstream body", { status: 503 }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));

  await expect(runScheduledMaintenance(environment, fetcher)).rejects.toThrow(
    "Maintenance targets failed: production=http_503",
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("sanitizes network failures and attempts the second target", async () => {
  const fetcher = jest
    .fn()
    .mockRejectedValueOnce(new Error("secret transport detail"))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));

  const promise = runScheduledMaintenance(environment, fetcher);
  await expect(promise).rejects.toThrow("Maintenance targets failed: production=network_error");
  await expect(promise).rejects.not.toThrow("secret transport detail");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("reports both failures only after both targets were attempted", async () => {
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(new Response(null, { status: 500 }));

  await expect(runScheduledMaintenance(environment, fetcher)).rejects.toThrow(
    "Maintenance targets failed: production=http_401, staging=http_500",
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 4: Write failing binding and HTTPS validation tests**

```ts
it.each([
  ["missing staging secret", { ...environment, STAGING_MAINTENANCE_SECRET: "" }, "staging=missing_secret"],
  ["invalid production URL", { ...environment, MAINTENANCE_ENDPOINT: "not-a-url" }, "production=invalid_endpoint"],
  ["non-HTTPS staging URL", { ...environment, STAGING_MAINTENANCE_ENDPOINT: "http://api-staging.example.com/maintenance" }, "staging=invalid_endpoint"],
])("fails safely for %s while still attempting the other target", async (_name, candidate, reason) => {
  const fetcher = jest.fn(async () => new Response(null, { status: 200 }));

  await expect(runScheduledMaintenance(candidate, fetcher)).rejects.toThrow(reason);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 5: Run the focused test and verify RED**

Run: `npx jest __tests__/gift-maintenance-worker.test.ts --runInBand`

Expected: FAIL because the current Worker performs only one production request and has no staging binding or aggregate failure behavior.

### Task 2: Implement minimal sequential dual-target orchestration

**Files:**
- Modify: `workers/gift-maintenance/src/index.ts`
- Test: `__tests__/gift-maintenance-worker.test.ts`

- [ ] **Step 1: Expand the environment type and define fixed targets and safe codes**

```ts
export type MaintenanceWorkerEnvironment = {
  MAINTENANCE_ENDPOINT?: string;
  MAINTENANCE_SECRET?: string;
  STAGING_MAINTENANCE_ENDPOINT?: string;
  STAGING_MAINTENANCE_SECRET?: string;
};

type MaintenanceTarget = {
  label: "production" | "staging";
  endpoint: string | undefined;
  secret: string | undefined;
};

class MaintenanceTargetFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function getMaintenanceTargets(environment: MaintenanceWorkerEnvironment): MaintenanceTarget[] {
  return [
    {
      label: "production",
      endpoint: environment.MAINTENANCE_ENDPOINT,
      secret: environment.MAINTENANCE_SECRET,
    },
    {
      label: "staging",
      endpoint: environment.STAGING_MAINTENANCE_ENDPOINT,
      secret: environment.STAGING_MAINTENANCE_SECRET,
    },
  ];
}
```

- [ ] **Step 2: Add the one-attempt target helper**

```ts
async function runMaintenanceTarget(target: MaintenanceTarget, fetcher: WorkerFetch): Promise<void> {
  const endpoint = target.endpoint?.trim();
  const secret = target.secret?.trim();
  if (!endpoint) throw new MaintenanceTargetFailure("missing_endpoint");
  if (!secret) throw new MaintenanceTargetFailure("missing_secret");

  try {
    if (new URL(endpoint).protocol !== "https:") {
      throw new MaintenanceTargetFailure("invalid_endpoint");
    }
  } catch (error) {
    if (error instanceof MaintenanceTargetFailure) throw error;
    throw new MaintenanceTargetFailure("invalid_endpoint");
  }

  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: "POST",
      headers: { "x-gift-maintenance-secret": secret },
    });
  } catch {
    throw new MaintenanceTargetFailure("network_error");
  }

  try {
    if (!response.ok) throw new MaintenanceTargetFailure(`http_${response.status}`);
  } finally {
    try {
      await response.body?.cancel();
    } catch {
      // Response cleanup must not expose or replace the maintenance result.
    }
  }
}
```

- [ ] **Step 3: Replace the single request with ordered aggregation**

```ts
export async function runScheduledMaintenance(
  environment: MaintenanceWorkerEnvironment,
  fetcher: WorkerFetch = fetch,
): Promise<void> {
  const failures: string[] = [];

  for (const target of getMaintenanceTargets(environment)) {
    try {
      await runMaintenanceTarget(target, fetcher);
    } catch (error) {
      const code = error instanceof MaintenanceTargetFailure ? error.code : "unexpected_error";
      failures.push(`${target.label}=${code}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Maintenance targets failed: ${failures.join(", ")}`);
  }
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npx jest __tests__/gift-maintenance-worker.test.ts --runInBand`

Expected: PASS; two requests occur sequentially, response bodies are cancelled, and failures are sanitized and aggregated.

- [ ] **Step 5: Commit the tested Worker behavior locally**

```powershell
git add __tests__/gift-maintenance-worker.test.ts workers/gift-maintenance/src/index.ts
git commit -m "feat: maintain production and staging hourly"
```

### Task 3: Add the non-secret staging endpoint configuration contract

**Files:**
- Modify: `__tests__/gift-maintenance-worker.test.ts`
- Modify: `workers/gift-maintenance/wrangler.toml`

- [ ] **Step 1: Strengthen the failing Wrangler contract test**

```ts
expect(config).toContain('crons = ["0 * * * *"]');
expect(config).toContain('MAINTENANCE_ENDPOINT = "https://api.onetapreality.com/api/internal/gift-maintenance"');
expect(config).toContain(
  'STAGING_MAINTENANCE_ENDPOINT = "https://api-staging.onetapreality.com/api/internal/gift-maintenance"',
);
expect(config).not.toMatch(/(?:^|\n)\s*(?:MAINTENANCE_SECRET|STAGING_MAINTENANCE_SECRET)\s*=/u);
expect(config).not.toMatch(/r2_buckets|kv_namespaces|d1_databases|durable_objects|queues/iu);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx jest __tests__/gift-maintenance-worker.test.ts --runInBand`

Expected: FAIL because `STAGING_MAINTENANCE_ENDPOINT` is not yet present in `wrangler.toml`.

- [ ] **Step 3: Add only the non-secret staging endpoint**

```toml
[vars]
MAINTENANCE_ENDPOINT = "https://api.onetapreality.com/api/internal/gift-maintenance"
STAGING_MAINTENANCE_ENDPOINT = "https://api-staging.onetapreality.com/api/internal/gift-maintenance"
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npx jest __tests__/gift-maintenance-worker.test.ts --runInBand`

Expected: PASS with one Cron, both non-secret endpoints, neither secret, and no storage/queue binding.

- [ ] **Step 5: Commit the configuration contract locally**

```powershell
git add __tests__/gift-maintenance-worker.test.ts workers/gift-maintenance/wrangler.toml
git commit -m "config: add staging maintenance target"
```

### Task 4: Verify the complete local change

**Files:**
- Verify: `docs/DECISIONS.md`
- Verify: `docs/superpowers/specs/2026-08-31-worker-dual-environment-maintenance-design.md`
- Verify: `__tests__/gift-maintenance-worker.test.ts`
- Verify: `workers/gift-maintenance/src/index.ts`
- Verify: `workers/gift-maintenance/wrangler.toml`

- [ ] **Step 1: Check formatting and secrets**

Run:

```powershell
git diff --check
rg -n "(?:MAINTENANCE_SECRET|STAGING_MAINTENANCE_SECRET)\s*=" workers docs __tests__
```

Expected: `git diff --check` exits 0. The secret scan finds no committed assignment in Worker configuration or implementation; test fixtures may contain only obvious placeholder strings.

- [ ] **Step 2: Run lint and type checking**

Run:

```powershell
npm run lint
npm run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 3: Run the full test suite**

Run: `npm run test:ci`

Expected: all Jest and Node test suites pass.

- [ ] **Step 4: Build the server bundle**

Run: `npm run build:server`

Expected: production server build exits 0 without contacting production or staging maintenance endpoints.

- [ ] **Step 5: Run the Worker dry-run**

Run: `npm run worker:check`

Expected: Wrangler reports a successful dry-run with both endpoint variables, one scheduled trigger, and no R2/KV/D1/Queue binding. It must not deploy or invoke either live endpoint.

- [ ] **Step 6: Review the final branch without remote writes**

Run:

```powershell
git status --short
git log --oneline --decorate -4
git diff origin/main...HEAD --stat
```

Expected: the implementation worktree is clean, all commits are local to `codex/worker-dual-environment-maintenance`, and no push, PR, deployment, secret update, or cloud configuration change has occurred.
