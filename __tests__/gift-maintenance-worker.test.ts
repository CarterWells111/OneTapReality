import { readFileSync } from "node:fs";
import { join } from "node:path";

import worker, { runScheduledMaintenance } from "../workers/gift-maintenance/src/index";

describe("gift maintenance Worker", () => {
  const environment = {
    MAINTENANCE_ENDPOINT: "https://api.example.com/api/internal/gift-maintenance",
    MAINTENANCE_SECRET: "production-secret",
    STAGING_MAINTENANCE_ENDPOINT: "https://api-staging.example.com/api/internal/gift-maintenance",
    STAGING_MAINTENANCE_SECRET: "staging-secret",
  };

  it("maintains production then staging with isolated secrets", async () => {
    const cancelProduction = jest.fn();
    const cancelStaging = jest.fn();
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(new Response(new ReadableStream({ cancel: cancelProduction }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new ReadableStream({ cancel: cancelStaging }), { status: 202 }));

    await runScheduledMaintenance(environment, fetcher);

    expect(fetcher.mock.calls).toEqual([
      [
        environment.MAINTENANCE_ENDPOINT,
        {
          method: "POST",
          headers: { "x-gift-maintenance-secret": environment.MAINTENANCE_SECRET },
        },
      ],
      [
        environment.STAGING_MAINTENANCE_ENDPOINT,
        {
          method: "POST",
          headers: { "x-gift-maintenance-secret": environment.STAGING_MAINTENANCE_SECRET },
        },
      ],
    ]);
    expect(cancelProduction).toHaveBeenCalledTimes(1);
    expect(cancelStaging).toHaveBeenCalledTimes(1);
  });

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

    let capturedError: unknown;
    try {
      await runScheduledMaintenance(environment, fetcher);
    } catch (error) {
      capturedError = error;
    }

    expect(capturedError).toEqual(
      new Error("Maintenance targets failed: production=network_error"),
    );
    expect(String(capturedError)).not.toContain("secret transport detail");
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

  it.each([
    ["missing production endpoint", { ...environment, MAINTENANCE_ENDPOINT: "" }, "production=missing_endpoint"],
    ["missing production secret", { ...environment, MAINTENANCE_SECRET: "" }, "production=missing_secret"],
    ["missing staging secret", { ...environment, STAGING_MAINTENANCE_SECRET: "" }, "staging=missing_secret"],
    ["invalid production URL", { ...environment, MAINTENANCE_ENDPOINT: "not-a-url" }, "production=invalid_endpoint"],
    [
      "non-HTTPS staging URL",
      { ...environment, STAGING_MAINTENANCE_ENDPOINT: "http://api-staging.example.com/maintenance" },
      "staging=invalid_endpoint",
    ],
  ])("fails safely for %s while still attempting the other target", async (_name, candidate, reason) => {
    const fetcher = jest.fn(async () => new Response(null, { status: 200 }));

    await expect(runScheduledMaintenance(candidate, fetcher)).rejects.toThrow(reason);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("exposes only a scheduled handler", () => {
    expect(worker).toEqual({ scheduled: expect.any(Function) });
    expect(worker).not.toHaveProperty("fetch");
  });

  it("disables platform retries before making the hourly request", async () => {
    const noRetry = jest.fn();
    const fetcher = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    await worker.scheduled({ noRetry }, environment);

    expect(noRetry).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
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
