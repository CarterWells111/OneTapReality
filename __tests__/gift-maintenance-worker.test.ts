import { readFileSync } from "node:fs";
import { join } from "node:path";

import worker, { runScheduledMaintenance } from "../workers/gift-maintenance/src/index";

describe("gift maintenance Worker", () => {
  const environment = {
    MAINTENANCE_ENDPOINT: "https://api.example.com/api/internal/gift-maintenance",
    MAINTENANCE_SECRET: "server-secret",
  };

  it("posts once with the server-only secret and does not retry failures", async () => {
    const fetcher = jest.fn(async () => new Response(null, { status: 503 }));

    await expect(runScheduledMaintenance(environment, fetcher)).rejects.toThrow("Maintenance endpoint returned 503");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(environment.MAINTENANCE_ENDPOINT, {
      method: "POST",
      headers: { "x-gift-maintenance-secret": environment.MAINTENANCE_SECRET },
    });
  });

  it("exposes only a scheduled handler", () => {
    expect(worker).toEqual({ scheduled: expect.any(Function) });
    expect(worker).not.toHaveProperty("fetch");
  });

  it("disables platform retries before making the hourly request", async () => {
    const noRetry = jest.fn();
    const fetcher = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 200 }));

    await worker.scheduled({ noRetry }, environment);

    expect(noRetry).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockRestore();
  });

  it("keeps one hourly trigger and has no paid storage bindings or committed secret", () => {
    const config = readFileSync(join(process.cwd(), "workers/gift-maintenance/wrangler.toml"), "utf8");

    expect(config).toContain('crons = ["0 * * * *"]');
    expect(config).toContain("MAINTENANCE_ENDPOINT");
    expect(config).not.toMatch(/MAINTENANCE_SECRET\s*=/u);
    expect(config).not.toMatch(/r2_buckets|kv_namespaces|d1_databases|durable_objects|queues/iu);
  });
});
