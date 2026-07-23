jest.mock("../src/server/db/client", () => ({
  getServerDatabase: jest.fn(() => ({ run: jest.fn().mockResolvedValue(undefined) })),
}));

jest.mock("../src/server/auth/device-auth", () => ({
  authenticateRequest: jest.fn(),
  createAccessToken: jest.fn(() => "test-token"),
  hashAccessToken: jest.fn(async () => "test-hash"),
  extractBearerToken: jest.fn(),
}));

jest.mock("../src/server/memories/repository", () => ({
  createDevice: jest.fn(),
  getDeviceByInstallationId: jest.fn(),
  rotateDeviceToken: jest.fn(),
  listMemories: jest.fn(),
  createMemory: jest.fn(),
  getMemory: jest.fn(),
  updateMemory: jest.fn(),
  deleteMemory: jest.fn(),
}));

import { GET as getHealth } from "../src/app/api/health+api";
import { GET as getCapabilities } from "../src/app/api/capabilities+api";
import { POST as registerDevice } from "../src/app/api/devices/register+api";
import { GET as listCloudMemories } from "../src/app/api/memories+api";
import { authenticateRequest } from "../src/server/auth/device-auth";
import { createDevice, getDeviceByInstallationId, listMemories } from "../src/server/memories/repository";

describe("backend API routes", () => {
  it("returns health and capabilities without authentication", async () => {
    const health = await getHealth(new Request("http://localhost/api/health"));
    const capabilities = await getCapabilities(new Request("http://localhost/api/capabilities"));

    expect(health.status).toBe(200);
    expect((await health.json()).contractVersion).toBe(1);
    expect((await capabilities.json()).features.automaticSync).toBe(false);
  });

  it("rejects memory listing when authentication fails", async () => {
    (authenticateRequest as jest.Mock).mockResolvedValueOnce(null);

    const response = await listCloudMemories(new Request("http://localhost/api/memories"));

    expect(response.status).toBe(401);
    expect(listMemories).not.toHaveBeenCalled();
  });

  it("registers a new anonymous device without returning a database secret", async () => {
    process.env.DEVICE_TOKEN_PEPPER = "test-pepper";
    (getDeviceByInstallationId as jest.Mock).mockResolvedValueOnce(null);

    const response = await registerDevice(new Request("http://localhost/api/devices/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installationId: "installation-id-123456" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.accessToken).toBe("test-token");
    expect(createDevice).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      installationId: "installation-id-123456",
      tokenHash: "test-hash",
    }));
    delete process.env.DEVICE_TOKEN_PEPPER;
  });
});
