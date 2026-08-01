const mockRunGiftMaintenance = jest.fn();

jest.mock("../src/server/db/client", () => ({ getServerDatabase: jest.fn(() => ({ database: true })) }));
jest.mock("../src/server/gifts/r2-media", () => ({ getR2MediaStoreFromEnvironment: jest.fn(() => ({ storage: true })) }));
jest.mock("../src/server/maintenance/run-gift-maintenance", () => ({ runGiftMaintenance: (...args: unknown[]) => mockRunGiftMaintenance(...args) }));

import { POST } from "../src/app/api/internal/gift-maintenance+api";

describe("gift maintenance API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GIFT_CARD_CLEANUP_SECRET = "maintenance-secret";
    mockRunGiftMaintenance.mockResolvedValue({ skipped: false, claimedCleanupJobs: 1, completedCleanupJobs: 1 });
  });

  afterEach(() => { delete process.env.GIFT_CARD_CLEANUP_SECRET; });

  it("runs scheduled maintenance with the server-only secret", async () => {
    const response = await POST(new Request("http://localhost/api/internal/gift-maintenance", {
      method: "POST",
      headers: { "x-gift-maintenance-secret": "maintenance-secret" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ skipped: false, claimedCleanupJobs: 1, completedCleanupJobs: 1 });
    expect(mockRunGiftMaintenance).toHaveBeenCalledWith(expect.objectContaining({ mode: "scheduled" }));
  });

  it("rejects an invalid secret without invoking maintenance", async () => {
    const response = await POST(new Request("http://localhost/api/internal/gift-maintenance", {
      method: "POST",
      headers: { "x-gift-maintenance-secret": "wrong" },
    }));

    expect(response.status).toBe(403);
    expect(mockRunGiftMaintenance).not.toHaveBeenCalled();
  });
});
