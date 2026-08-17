import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";
import { appMaintenanceState } from "../src/server/db/schema";
import type { PrivateMediaStore } from "../src/server/gifts/r2-media";
import { runOpportunisticGiftMaintenanceIfOverdue } from "../src/server/maintenance/opportunistic-gift-maintenance";

const store: PrivateMediaStore = {
  createUploadUrl: jest.fn(),
  createReadUrl: jest.fn(),
  getObjectMetadata: jest.fn(),
  objectExists: jest.fn(),
  deleteObjects: jest.fn(async () => undefined),
  copyObject: jest.fn(async () => undefined),
};

describe("opportunistic gift maintenance", () => {
  it("does nothing while the last completed run is newer than 90 minutes", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await db.insert(appMaintenanceState).values({ id: "gift", leaseToken: null, leaseUntil: null, lastStartedAt: "2026-07-25T01:00:00.000Z", lastCompletedAt: "2026-07-25T01:00:00.000Z", lastErrorCode: null });

      await expect(runOpportunisticGiftMaintenanceIfOverdue({ db, store, now: new Date("2026-07-25T02:00:00.000Z") })).resolves.toBeNull();
    } finally { await close(); }
  });

  it("runs the small opportunistic profile after 90 minutes", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await db.insert(appMaintenanceState).values({ id: "gift", leaseToken: null, leaseUntil: null, lastStartedAt: "2026-07-25T01:00:00.000Z", lastCompletedAt: "2026-07-25T01:00:00.000Z", lastErrorCode: null });

      await expect(runOpportunisticGiftMaintenanceIfOverdue({ db, store, now: new Date("2026-07-25T02:31:00.000Z") })).resolves.toEqual(expect.objectContaining({ skipped: false }));
    } finally { await close(); }
  });
});
