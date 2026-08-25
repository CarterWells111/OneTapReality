import { eq } from "drizzle-orm";

import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";
import { giftMediaCleanupJobs, giftPublishSessions } from "../src/server/db/schema";
import {
  claimGiftMediaCleanupJobs,
  claimGiftByTokenHash,
  createGift,
  createGiftPublishSession,
  expireGiftPublishSessions,
  failGiftMediaCleanupJob,
  listGiftMediaCleanupJobs,
  purgeGiftMaintenanceData,
} from "../src/server/gifts/repository";

describe("gift maintenance repository", () => {
  it("claims a bounded due batch and leases each job once", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "gift-1", tokenHash: "token", createdAt: "2026-07-25T00:00:00.000Z" });
      await db.insert(giftMediaCleanupJobs).values([0, 1, 2].map((index) => ({
        id: `job-${index}`,
        giftId: "gift-1",
        objectKey: `object-${index}`,
        state: "pending",
        attempts: 0,
        nextAttemptAt: `2026-07-25T00:0${index}:00.000Z`,
        leaseUntil: null,
        lastError: null,
        completedAt: null,
        createdAt: "2026-07-25T00:00:00.000Z",
      })));

      const first = await claimGiftMediaCleanupJobs(db, "2026-07-25T00:05:00.000Z", "2026-07-25T00:10:00.000Z", 2);
      expect(first.map((job) => job.id)).toEqual(["job-0", "job-1"]);
      expect(first.every((job) => job.state === "processing" && job.attempts === 1)).toBe(true);
      await expect(claimGiftMediaCleanupJobs(db, "2026-07-25T00:05:00.000Z", "2026-07-25T00:10:00.000Z", 2)).resolves.toEqual([
        expect.objectContaining({ id: "job-2" }),
      ]);
    } finally { await close(); }
  });

  it("moves a tenth failed attempt to dead letter without exposing an object key", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "gift-1", tokenHash: "token", createdAt: "2026-07-25T00:00:00.000Z" });
      await db.insert(giftMediaCleanupJobs).values({
        id: "job-1", giftId: "gift-1", objectKey: "private/key.jpg", state: "processing", attempts: 10,
        nextAttemptAt: "2026-07-25T00:00:00.000Z", leaseUntil: "2026-07-25T00:10:00.000Z",
        lastError: null, completedAt: null, createdAt: "2026-07-25T00:00:00.000Z",
      });

      await failGiftMediaCleanupJob(db, "job-1", "r2_delete_failed", "2026-07-25T00:05:00.000Z", "2026-07-25T06:05:00.000Z");
      const [job] = await db.select().from(giftMediaCleanupJobs).where(eq(giftMediaCleanupJobs.id, "job-1"));
      expect(job).toEqual(expect.objectContaining({ state: "dead_letter", completedAt: "2026-07-25T00:05:00.000Z", lastError: "r2_delete_failed", leaseUntil: null }));
      expect(job.lastError).not.toContain("private/key.jpg");
    } finally { await close(); }
  });

  it("purges completed publication and cleanup rows only after their cutoffs", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "gift-1", tokenHash: "token", createdAt: "2026-07-25T00:00:00.000Z" });
      await db.insert(giftPublishSessions).values({
        id: "old-publish", giftId: "gift-1", ownerEmail: "owner@example.com", baseVersion: 0, payloadJson: { pages: [], media: [] },
        expiresAt: "2026-07-24T00:05:00.000Z", completedAt: "2026-07-24T00:01:00.000Z", createdAt: "2026-07-24T00:00:00.000Z",
      });
      await db.insert(giftMediaCleanupJobs).values({
        id: "old-job", giftId: "gift-1", objectKey: "old-object", state: "completed", attempts: 1,
        nextAttemptAt: "2026-07-18T00:00:00.000Z", leaseUntil: null, lastError: null,
        completedAt: "2026-07-18T00:01:00.000Z", createdAt: "2026-07-18T00:00:00.000Z",
      });

      await expect(purgeGiftMaintenanceData(db, {
        publishCutoff: "2026-07-24T12:00:00.000Z",
        jobCutoff: "2026-07-18T12:00:00.000Z",
        limit: 100,
      })).resolves.toEqual({ publishSessions: 1, cleanupJobs: 1 });
    } finally { await close(); }
  });

  it("locks expired publication sessions before queueing their media for deletion", async () => {
    const queries: string[] = [];
    const { db, close } = createBackendTestDatabase({ onQuery: (query) => queries.push(query) });
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "gift-1", tokenHash: "token", createdAt: "2026-07-25T00:00:00.000Z" });
      await claimGiftByTokenHash(db, "token", "owner@example.com", "2026-07-25T00:00:01.000Z");
      await createGiftPublishSession(db, {
        id: "publish-1",
        giftId: "gift-1",
        ownerEmail: "owner@example.com",
        baseVersion: 0,
        payload: {
          sourceMemoryId: "memory-1", title: "Album", pages: [],
          media: [
            { position: 0, objectKey: "existing-current-object", contentType: "image/jpeg", byteSize: 1, source: "existing" },
            { position: 1, objectKey: "object-1", contentType: "image/jpeg", byteSize: 1, source: "upload" },
          ],
          cover: { objectKey: "object-cover-1", contentType: "image/jpeg", byteSize: 1 },
        },
        expiresAt: "2026-07-25T00:05:00.000Z",
        createdAt: "2026-07-25T00:00:00.000Z",
      });
      queries.length = 0;

      await expireGiftPublishSessions(db, "2026-07-25T00:06:00.000Z", 5);

      expect(queries.join("\n")).toMatch(/from gift_publish_sessions[\s\S]*for update skip locked/iu);
      const cleanup = await listGiftMediaCleanupJobs(db, "2026-07-25T00:06:00.000Z");
      expect(cleanup).toEqual(expect.arrayContaining([
        expect.objectContaining({ objectKey: "object-1" }),
        expect.objectContaining({ objectKey: "object-cover-1" }),
      ]));
      expect(cleanup).not.toEqual(expect.arrayContaining([expect.objectContaining({ objectKey: "existing-current-object" })]));
    } finally { await close(); }
  });
});
