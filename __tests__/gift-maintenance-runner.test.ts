import { eq } from "drizzle-orm";

import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";
import { appMaintenanceState, giftMediaCleanupJobs } from "../src/server/db/schema";
import { createGift } from "../src/server/gifts/repository";
import type { PrivateMediaStore } from "../src/server/gifts/r2-media";
import { runGiftMaintenance } from "../src/server/maintenance/run-gift-maintenance";

function createStore(deleteObjects = jest.fn(async () => undefined)): PrivateMediaStore {
  return {
    createUploadUrl: jest.fn(),
    createReadUrl: jest.fn(),
    getObjectMetadata: jest.fn(),
    objectExists: jest.fn(),
    deleteObjects,
  };
}

describe("gift maintenance runner", () => {
  it("leases, deletes, completes and reports a bounded scheduled batch", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "gift-1", tokenHash: "token", createdAt: "2026-07-25T00:00:00.000Z" });
      await db.insert(giftMediaCleanupJobs).values({
        id: "job-1", giftId: "gift-1", objectKey: "object-1", state: "pending", attempts: 0,
        nextAttemptAt: "2026-07-25T00:00:00.000Z", leaseUntil: null, lastError: null,
        completedAt: null, createdAt: "2026-07-25T00:00:00.000Z",
      });
      const deleteObjects = jest.fn(async () => undefined);

      const stats = await runGiftMaintenance({ db, store: createStore(deleteObjects), mode: "scheduled", now: new Date("2026-07-25T01:00:00.000Z") });

      expect(stats).toEqual(expect.objectContaining({ skipped: false, claimedCleanupJobs: 1, completedCleanupJobs: 1, failedCleanupJobs: 0, deadLetteredCleanupJobs: 0 }));
      expect(deleteObjects).toHaveBeenCalledWith(["object-1"], {
        abortSignal: expect.any(AbortSignal),
      });
      const [job] = await db.select().from(giftMediaCleanupJobs).where(eq(giftMediaCleanupJobs.id, "job-1"));
      expect(job).toEqual(expect.objectContaining({ state: "completed", leaseUntil: null }));
    } finally { await close(); }
  });

  it("skips a run while another maintenance lease is active", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await db.insert(appMaintenanceState).values({
        id: "gift",
        leaseToken: "active-run",
        leaseUntil: "2026-07-25T01:05:00.000Z",
        lastStartedAt: "2026-07-25T01:00:00.000Z",
        lastCompletedAt: null,
        lastErrorCode: null,
      });
      const second = await runGiftMaintenance({ db, store: createStore(), mode: "scheduled", now: new Date("2026-07-25T01:01:00.000Z") });

      expect(second).toEqual(expect.objectContaining({ skipped: true, claimedCleanupJobs: 0 }));
    } finally { await close(); }
  });
});
