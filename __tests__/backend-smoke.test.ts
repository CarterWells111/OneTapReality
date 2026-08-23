const mockDatabaseExecute = jest.fn();

jest.mock("../src/server/db/client", () => ({
  getServerDatabase: jest.fn(() => ({ execute: mockDatabaseExecute })),
}));

const { verifyBackend } = require("../scripts/verify-backend.cjs");
const { GET: getHealth } = require("../src/app/api/health+api");

describe("backend deployment smoke check", () => {
  beforeEach(() => {
    mockDatabaseExecute.mockReset();
  });

  it("rejects health when the database schema is version 10", async () => {
    mockDatabaseExecute.mockResolvedValueOnce({ rows: [{ version: 10 }] });

    const response = await getHealth(new Request("http://localhost/api/health"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: { code: "database_schema_outdated", message: "Database schema is not ready" },
    });
  });

  it("reports health when the database schema is version 11", async () => {
    mockDatabaseExecute.mockResolvedValueOnce({ rows: [{ version: 11 }] });

    const response = await getHealth(new Request("http://localhost/api/health"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ database: "ok", schemaVersion: 11 }));
  });

  it("verifies health, registration, CRUD visibility, and cleanup", async () => {
    const fetchImpl = jest.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      const method = init?.method ?? "GET";

      if (url.pathname === "/api/health") {
        return Response.json({ service: "onetapreality-api", contractVersion: 1, database: "ok" });
      }
      if (url.pathname === "/api/devices/register" && method === "POST") {
        return Response.json({ contractVersion: 1, deviceId: "device-1", accessToken: "local-secret-token" }, { status: 201 });
      }
      if (url.pathname === "/api/memories" && method === "POST") {
        return Response.json({ contractVersion: 1, memory: { id: "memory-1" } }, { status: 201 });
      }
      if (url.pathname === "/api/memories" && method === "GET") {
        return Response.json({ contractVersion: 1, items: [{ id: "memory-1" }] });
      }
      if (url.pathname === "/api/memories/memory-1" && method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      return Response.json({ error: { code: "unexpected", message: "Unexpected request" } }, { status: 500 });
    });

    await expect(verifyBackend("https://example.up.railway.app/", fetchImpl)).resolves.toEqual({
      health: 200,
      register: 201,
      create: 201,
      list: 200,
      delete: 204,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });
});
