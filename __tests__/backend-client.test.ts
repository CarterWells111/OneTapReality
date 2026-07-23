import {
  BackendApiClient,
  BackendApiError,
  resolveBackendRequestUrl,
} from "../src/services/backend/api-client";

describe("backend client", () => {
  afterEach(() => jest.restoreAllMocks());

  it("parses a health response", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ service: "adventurex-api", contractVersion: 1, database: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(new BackendApiClient().getHealth()).resolves.toEqual(
      expect.objectContaining({ database: "ok" }),
    );
  });

  it("turns a non-success response into a typed error", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "unauthorized", message: "No token" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(new BackendApiClient().getHealth()).rejects.toEqual(
      expect.objectContaining<Partial<BackendApiError>>({ status: 401, code: "unauthorized" }),
    );
  });

  it("uses an explicit production origin without a trailing slash", () => {
    expect(resolveBackendRequestUrl("/api/health", "https://example.up.railway.app/"))
      .toBe("https://example.up.railway.app/api/health");
  });

  it("keeps development requests relative when no origin is configured", () => {
    expect(resolveBackendRequestUrl("/api/health", undefined)).toBe("/api/health");
  });
});
