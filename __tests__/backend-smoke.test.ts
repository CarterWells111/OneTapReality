const { verifyBackend } = require("../scripts/verify-backend.cjs");

describe("backend deployment smoke check", () => {
  it("verifies health, registration, CRUD visibility, and cleanup", async () => {
    const fetchImpl = jest.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      const method = init?.method ?? "GET";

      if (url.pathname === "/api/health") {
        return Response.json({ service: "onetapreality-api", contractVersion: 1, database: "ok", writeFreeze: false });
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
