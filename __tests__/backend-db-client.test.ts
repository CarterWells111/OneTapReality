import { getDatabasePoolConfig, getDatabaseUrl } from "../src/server/db/client";

describe("server PostgreSQL configuration", () => {
  it("requires DATABASE_URL", () => {
    expect(() => getDatabaseUrl({})).toThrow("DATABASE_URL is required");
  });

  it("returns the configured PostgreSQL URL", () => {
    expect(getDatabaseUrl({
      DATABASE_URL: "postgresql://user:pass@host:5432/app",
    })).toBe("postgresql://user:pass@host:5432/app");
  });

  it("bounds production connection usage and connection waits", () => {
    expect(getDatabasePoolConfig("postgresql://user:pass@host:5432/app")).toEqual({
      connectionString: "postgresql://user:pass@host:5432/app",
      max: 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
    });
  });
});
