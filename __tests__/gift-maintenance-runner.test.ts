import { eq, sql } from "drizzle-orm";

import { acceptAccountDeletion, createAccountDeletionChallenge } from "../src/server/auth/account-deletion";
import { createAuthSession, createOrGetUserByEmail } from "../src/server/auth/repository";
import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";
import { appMaintenanceState, giftMediaCleanupJobs } from "../src/server/db/schema";
import { claimGiftByTokenHash, completeGiftPublishSession, createGift, createGiftPublishSession } from "../src/server/gifts/repository";
import type { PrivateMediaStore } from "../src/server/gifts/r2-media";
import { runGiftMaintenance } from "../src/server/maintenance/run-gift-maintenance";

function createStore(deleteObjects: PrivateMediaStore["deleteObjects"] = jest.fn(async () => undefined)): PrivateMediaStore {
  return {
    createUploadUrl: jest.fn(),
    createReadUrl: jest.fn(),
    getObjectMetadata: jest.fn(),
    objectExists: jest.fn(),
    deleteObjects,
    copyObject: jest.fn(async () => undefined),
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

  it("completes cleanup jobs for referenced winner finals without deleting the R2 object", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "gift-1", tokenHash: "token", createdAt: "2026-08-16T00:00:00.000Z" });
      await claimGiftByTokenHash(db, "token", "owner@example.com", "2026-08-16T00:01:00.000Z");
      const finalKey = "gifts/gift-1/publish/final/attempt/photo";
      await createGiftPublishSession(db, { id: "publish", giftId: "gift-1", ownerEmail: "owner@example.com", baseVersion: 0, createdAt: "2026-08-16T00:02:00.000Z", expiresAt: "2026-08-16T00:12:00.000Z", payload: { sourceMemoryId: "memory", title: "Trip", pages: [], media: [] } });
      await completeGiftPublishSession(db, { sessionId: "publish", ownerEmail: "owner@example.com", now: "2026-08-16T00:03:00.000Z", payload: { sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ position: 0, objectKey: finalKey, contentType: "image/jpeg", byteSize: 12, source: "upload" }] } });
      await db.insert(giftMediaCleanupJobs).values({ id: "attempt-job", giftId: "gift-1", objectKey: finalKey, state: "pending", attempts: 0, nextAttemptAt: "2026-08-16T00:03:00.000Z", leaseUntil: null, lastError: null, completedAt: null, createdAt: "2026-08-16T00:03:00.000Z" });
      const deleteObjects = jest.fn(async () => undefined);

      await runGiftMaintenance({ db, store: createStore(deleteObjects), mode: "scheduled", now: new Date("2026-08-16T00:04:00.000Z") });

      expect(deleteObjects).not.toHaveBeenCalled();
      const [job] = await db.select().from(giftMediaCleanupJobs).where(eq(giftMediaCleanupJobs.id, "attempt-job"));
      expect(job.state).toBe("completed");
    } finally { await close(); }
  });

  it("retries an unreferenced attempt final after an R2 deletion failure and later reclaims it", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "gift-1", tokenHash: "token", createdAt: "2026-08-16T00:00:00.000Z" });
      const finalKey = "gifts/gift-1/publish/final/rolled-back/photo";
      await db.insert(giftMediaCleanupJobs).values({ id: "attempt-job", giftId: "gift-1", objectKey: finalKey, state: "pending", attempts: 0, nextAttemptAt: "2026-08-16T00:00:00.000Z", leaseUntil: null, lastError: null, completedAt: null, createdAt: "2026-08-16T00:00:00.000Z" });
      const deleteObjects = jest.fn().mockRejectedValueOnce(new Error("R2 unavailable")).mockResolvedValueOnce(undefined);

      const failed = await runGiftMaintenance({ db, store: createStore(deleteObjects), mode: "scheduled", now: new Date("2026-08-16T00:01:00.000Z") });
      const reclaimed = await runGiftMaintenance({ db, store: createStore(deleteObjects), mode: "scheduled", now: new Date("2026-08-16T00:07:00.000Z") });

      expect(failed.failedCleanupJobs).toBe(1);
      expect(reclaimed.completedCleanupJobs).toBe(1);
      expect(deleteObjects).toHaveBeenCalledTimes(2);
    } finally { await close(); }
  });

  it("processes due account deletion before ordinary cleanup can exhaust the run budget", async () => {
    const { db, close } = createBackendTestDatabase();
    const dateNow = jest.spyOn(Date, "now");
    let ordinaryCleanupStarted = false;
    dateNow.mockImplementation(() => ordinaryCleanupStarted ? 30_000 : 0);
    try {
      await migrateBackendDatabase(db);
      const now = "2026-08-24T10:00:00.000Z";
      const user = await createOrGetUserByEmail(db, "owner@example.com", "2026-08-24T09:00:00.000Z");
      await createAuthSession(db, {
        id: "auth-session", userId: user.id, tokenHash: "auth-token", createdAt: now,
        expiresAt: "2026-08-25T10:00:00.000Z",
      });
      await createGift(db, { id: "owned-gift", tokenHash: "owned-token", createdAt: now });
      await claimGiftByTokenHash(db, "owned-token", user.email, now);
      await db.execute(sql`
        insert into shared_albums (id, gift_id, source_memory_id, title, published_at, version, cover_object_key)
        values ('owned-album', 'owned-gift', 'memory', 'Private', ${now}, 1, 'account-object')
      `);
      await createAccountDeletionChallenge(db, {
        id: "deletion-challenge", userId: user.id, sessionId: "auth-session", codeHash: "hash",
        createdAt: now, expiresAt: "2026-08-24T10:05:00.000Z",
      });
      await acceptAccountDeletion(db, {
        challengeId: "deletion-challenge", userId: user.id, sessionId: "auth-session", codeHash: "hash",
        confirmation: "DELETE", receiptId: "deletion-receipt", now,
        completeBy: "2026-08-25T10:00:00.000Z",
      });
      await createGift(db, { id: "ordinary-gift", tokenHash: "ordinary-token", createdAt: now });
      await db.insert(giftMediaCleanupJobs).values({
        id: "ordinary-job", giftId: "ordinary-gift", objectKey: "ordinary-object", state: "pending", attempts: 0,
        nextAttemptAt: now, leaseUntil: null, lastError: null, completedAt: null, createdAt: now,
      });
      const deleteObjects = jest.fn(async (keys: string[]) => {
        if (keys.includes("ordinary-object")) ordinaryCleanupStarted = true;
      });

      const stats = await runGiftMaintenance({ db, store: createStore(deleteObjects), mode: "scheduled", now: new Date(now) });

      expect(stats).toEqual(expect.objectContaining({
        claimedAccountDeletionJobs: 1,
        completedAccountDeletionJobs: 1,
      }));
      expect(deleteObjects.mock.calls[0]?.[0]).toEqual(["account-object"]);
    } finally {
      dateNow.mockRestore();
      await close();
    }
  });
});
