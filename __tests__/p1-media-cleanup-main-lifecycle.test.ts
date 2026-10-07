import { eq } from "drizzle-orm";

import { acceptAccountDeletion, createAccountDeletionChallenge, processAccountDeletionJobs } from "../src/server/auth/account-deletion";
import { createAuthSession, createOrGetUserByEmail } from "../src/server/auth/repository";
import type { BackendDatabase } from "../src/server/db/client";
import { accountDeletionJobs, accountDeletionMediaObjects, giftMediaCleanupJobs, gifts } from "../src/server/db/schema";
import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";
import * as repository from "../src/server/gifts/repository";
import type { GiftPublicationPayload } from "../src/server/gifts/repository";
import type { PrivateMediaStore } from "../src/server/gifts/r2-media";
import { runGiftMaintenance } from "../src/server/maintenance/run-gift-maintenance";

const giftId = "cleanup-main-gift";
const ownerEmail = "owner@example.test";
const time = (clock: string) => `2026-10-07T${clock}:00.000Z`;
const finalKeys = (attempt = "first") => ["photo", "cover"].map(kind => `gifts/${giftId}/${attempt}/final/${kind}`);

function album(attempt = "first"): GiftPublicationPayload {
  const [photo, cover] = finalKeys(attempt);
  return {
    sourceMemoryId: "memory", title: "Synthetic trip", travelDate: "2026-10-07", pages: [],
    media: [{ position: 0, objectKey: photo, contentType: "image/jpeg", byteSize: 12, source: "upload" }],
    cover: { objectKey: cover, contentType: "image/jpeg", byteSize: 12 },
  };
}

function mediaStore(deleteObjects: PrivateMediaStore["deleteObjects"] = jest.fn(async () => undefined)): PrivateMediaStore {
  return {
    createUploadUrl: jest.fn(), createReadUrl: jest.fn(), getObjectMetadata: jest.fn(),
    objectExists: jest.fn(), copyObject: jest.fn(), deleteObjects,
  };
}

async function seed(db: BackendDatabase) {
  await repository.createGift(db, { id: giftId, tokenHash: "synthetic-token", createdAt: time("00:00") });
  await repository.claimGiftByTokenHash(db, "synthetic-token", ownerEmail, time("00:01"));
}

async function publish(db: BackendDatabase, attempt = "first", baseVersion = 0, now = time("00:03"), payload = album(attempt)) {
  await repository.createGiftPublishSession(db, {
    id: attempt, giftId, ownerEmail, baseVersion, payload, createdAt: now,
    expiresAt: new Date(new Date(now).getTime() + 15 * 60_000).toISOString(),
  });
  return repository.completeGiftPublishSession(db, { sessionId: attempt, ownerEmail, now, payload });
}

function maintain(db: BackendDatabase, store: PrivateMediaStore, clock: string) {
  return runGiftMaintenance({ db, store, mode: "scheduled", now: new Date(time(clock)), sendContentReportNotice: jest.fn() });
}

async function retire(db: BackendDatabase, trigger: "disable" | "replace" | "approved_delete") {
  if (trigger === "disable") {
    await expect(repository.disableGift(db, giftId, time("01:01"))).resolves.toBe(true);
    await expect(repository.getOwnedGiftById(db, giftId, ownerEmail)).resolves.toBeNull();
  } else if (trigger === "replace") {
    await expect(publish(db, "replacement", 1, time("01:01"))).resolves.toMatchObject({ version: 2, replayed: false });
  } else {
    await repository.addGiftMember(db, giftId, "editor@example.test", time("01:01"), "editor");
    const request = await repository.createGiftManagementRequest(db, {
      giftId, userId: "synthetic-editor", email: "editor@example.test", action: "delete_album", now: time("01:01"),
    });
    expect(request.status).toBe("created");
    if (request.status !== "created") throw new Error("Expected a synthetic deletion request");
    await expect(repository.decideGiftManagementRequest(db, {
      giftId, requestId: request.request.id, ownerEmail, decision: "approved", now: time("01:02"),
    })).resolves.toEqual({ status: "approved" });
  }
}

describe("main P1 media cleanup lifecycle", () => {
  it.each(["disable", "replace", "approved_delete"] as const)("deletes media and cover finals completed while referenced after %s", async trigger => {
    const { db, close } = createBackendTestDatabase();
    const store = mediaStore();
    try {
      await migrateBackendDatabase(db);
      await seed(db);
      await repository.enqueueGiftMediaCleanupJobs(db, giftId, finalKeys(), time("00:03"));
      const published = await publish(db);
      expect(published).toMatchObject({ version: 1, replayed: false });
      await expect(repository.completeGiftPublishSession(db, {
        sessionId: "first", ownerEmail, now: time("00:04"),
      })).resolves.toMatchObject({ albumId: published!.albumId, version: 1, replayed: true });
      await maintain(db, store, "01:00");
      expect(store.deleteObjects).not.toHaveBeenCalled();
      expect((await db.select().from(giftMediaCleanupJobs)).every(job => job.state === "completed")).toBe(true);

      await retire(db, trigger);
      const result = await maintain(db, store, "02:00");
      expect(result).toMatchObject({ claimedCleanupJobs: 2, completedCleanupJobs: 2 });
      for (const key of finalKeys()) expect(store.deleteObjects).toHaveBeenCalledWith([key], { abortSignal: expect.any(AbortSignal) });
      expect(store.deleteObjects).toHaveBeenCalledTimes(2);
      await runGiftMaintenance({ db, store, mode: "scheduled", now: new Date("2026-10-15T02:00:00.000Z"), sendContentReportNotice: jest.fn() });
      expect(await db.select().from(giftMediaCleanupJobs)).toEqual([]);
      expect(store.deleteObjects).toHaveBeenCalledTimes(2);
    } finally { await close(); }
  });

  it.each(["completed", "dead_letter"])("reopens %s candidates without altering processing leases or pending backoff", async state => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await seed(db);
      await db.insert(giftMediaCleanupJobs).values([
        { id: "terminal", objectKey: "terminal-key", state, attempts: 10, nextAttemptAt: time("00:03"), leaseUntil: null, completedAt: time("01:00"), lastError: "r2_delete_failed" },
        { id: "active", objectKey: "active-key", state: "processing", attempts: 3, nextAttemptAt: time("00:03"), leaseUntil: time("02:30"), completedAt: null, lastError: null },
        { id: "retry", objectKey: "retry-key", state: "pending", attempts: 2, nextAttemptAt: time("03:00"), leaseUntil: null, completedAt: null, lastError: "r2_delete_failed" },
      ].map(job => ({ ...job, giftId, createdAt: time("00:03") })));
      const before = await db.select().from(giftMediaCleanupJobs);
      await repository.enqueueGiftMediaCleanupJobs(db, giftId, ["terminal-key", "terminal-key", "active-key", "retry-key"], time("02:00"));
      const after = await db.select().from(giftMediaCleanupJobs);
      expect(after).toHaveLength(3);
      expect(after.find(job => job.id === "terminal")).toMatchObject({ state: "pending", attempts: 0, nextAttemptAt: time("02:15"), leaseUntil: null, completedAt: null, lastError: null });
      for (const id of ["active", "retry"]) expect(after.find(job => job.id === id)).toEqual(before.find(job => job.id === id));
      expect((await repository.claimGiftMediaCleanupJobs(db, time("02:16"), time("02:21"))).map(job => job.id)).toEqual(["terminal"]);
      expect(await repository.claimGiftMediaCleanupJobs(db, time("02:31"), time("02:36"))).toContainEqual(expect.objectContaining({ id: "active", attempts: 4 }));
    } finally { await close(); }
  });

  it("retries reactivated media and cover deletion with bounded backoff", async () => {
    const { db, close } = createBackendTestDatabase();
    const deleteObjects = jest.fn().mockRejectedValueOnce(new Error("synthetic failure")).mockRejectedValueOnce(new Error("synthetic failure")).mockResolvedValue(undefined);
    const store = mediaStore(deleteObjects);
    try {
      await migrateBackendDatabase(db);
      await seed(db);
      await repository.enqueueGiftMediaCleanupJobs(db, giftId, finalKeys(), time("00:03"));
      await publish(db);
      await maintain(db, store, "01:00");
      await retire(db, "disable");
      expect(await maintain(db, store, "02:00")).toMatchObject({ failedCleanupJobs: 2 });
      expect((await db.select().from(giftMediaCleanupJobs)).every(job => job.state === "pending" && job.attempts === 1 && job.nextAttemptAt === time("02:05"))).toBe(true);
      expect(await maintain(db, store, "02:04")).toMatchObject({ claimedCleanupJobs: 0 });
      expect(await maintain(db, store, "02:06")).toMatchObject({ completedCleanupJobs: 2 });
      expect(deleteObjects).toHaveBeenCalledTimes(4);
    } finally { await close(); }
  });

  it("keeps referenced objects reused by a newer snapshot and preserves its travel date and replay receipt", async () => {
    const { db, close } = createBackendTestDatabase();
    const store = mediaStore();
    try {
      await migrateBackendDatabase(db);
      await seed(db);
      await repository.enqueueGiftMediaCleanupJobs(db, giftId, finalKeys(), time("00:03"));
      await publish(db);
      await maintain(db, store, "01:00");
      const retained = album();
      retained.media[0].source = "existing";
      const result = await publish(db, "retained", 1, time("01:01"), retained);
      await maintain(db, store, "02:00");
      expect(store.deleteObjects).not.toHaveBeenCalled();
      expect(result).toMatchObject({ version: 2, oldObjectKeys: [] });
      expect(await repository.getSharedAlbumSnapshot(db, result!.albumId)).toMatchObject({ album: { travelDate: "2026-10-07", coverObjectKey: finalKeys()[1] }, media: [{ objectKey: finalKeys()[0] }] });
    } finally { await close(); }
  });

  it("preserves work when disable runs after the reference check but before completion", async () => {
    const queries: string[] = [];
    const { db, close } = createBackendTestDatabase({ onQuery: query => queries.push(query) });
    const store = mediaStore();
    let spy: jest.SpyInstance | undefined;
    try {
      await migrateBackendDatabase(db);
      await seed(db);
      await repository.enqueueGiftMediaCleanupJobs(db, giftId, finalKeys(), time("00:03"));
      await publish(db);
      const readReference = repository.isGiftMediaObjectReferenced;
      spy = jest.spyOn(repository, "isGiftMediaObjectReferenced").mockImplementationOnce(async (database, objectKey) => {
        const referenced = await readReference(database, objectKey);
        await repository.disableGift(db, giftId, time("01:00"));
        return referenced;
      });
      queries.length = 0;
      await maintain(db, store, "01:00");
      spy.mockRestore();
      const [job] = await db.select().from(giftMediaCleanupJobs).where(eq(giftMediaCleanupJobs.objectKey, finalKeys()[0]));
      expect(job).toMatchObject({ state: "pending", attempts: 0, completedAt: null, leaseUntil: null });
      expect(queries.join("\n")).toMatch(/select id from gifts where id = .* for update/iu);
      await maintain(db, store, "02:00");
      expect(store.deleteObjects).toHaveBeenCalledWith([finalKeys()[0]], { abortSignal: expect.any(AbortSignal) });
    } finally { spy?.mockRestore(); await close(); }
  });

  it("keeps a terminal job revived after purge selected it", async () => {
    const { db, close } = createBackendTestDatabase();
    let spy: jest.SpyInstance | undefined;
    try {
      await migrateBackendDatabase(db);
      await seed(db);
      await db.insert(giftMediaCleanupJobs).values({ id: "old-job", giftId, objectKey: "old-key", state: "completed", attempts: 1, nextAttemptAt: time("00:00"), leaseUntil: null, lastError: null, completedAt: time("00:01"), createdAt: time("00:00") });
      const realDelete = db.delete.bind(db);
      spy = jest.spyOn(db, "delete").mockImplementation(table => {
        const query = realDelete(table);
        if (table === giftMediaCleanupJobs) {
          const execute = query.then.bind(query);
          jest.spyOn(query, "then").mockImplementation((resolve, reject) => repository.enqueueGiftMediaCleanupJobs(db, giftId, ["old-key"], time("02:00")).then(() => execute(resolve, reject)));
        }
        return query;
      });
      expect(await repository.purgeGiftMaintenanceData(db, { publishCutoff: time("01:00"), jobCutoff: time("01:00"), limit: 100 })).toMatchObject({ cleanupJobs: 0 });
      expect(await db.select().from(giftMediaCleanupJobs)).toEqual([expect.objectContaining({ id: "old-job", state: "pending", completedAt: null })]);
    } finally { spy?.mockRestore(); await close(); }
  });

  it("reopens deterministic finals in the existing authorized promotion reservation", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await seed(db);
      await repository.createGiftPublishSession(db, { id: "promotion", giftId, ownerEmail, baseVersion: 0, payload: album(), createdAt: time("00:02"), expiresAt: time("00:17") });
      await db.insert(giftMediaCleanupJobs).values(finalKeys().map((objectKey, index) => ({ id: `promoted-${index}`, giftId, objectKey, state: "completed", attempts: 1, nextAttemptAt: time("00:02"), leaseUntil: null, lastError: null, completedAt: time("00:03"), createdAt: time("00:02") })));
      await repository.reserveGiftPublicationPromotion(db, { giftId, sessionId: "promotion", ownerEmail, objectKeys: finalKeys(), now: time("00:04") });
      expect((await db.select().from(giftMediaCleanupJobs)).every(job => job.state === "pending" && job.nextAttemptAt === time("00:19") && job.attempts === 0 && job.completedAt === null)).toBe(true);
      await repository.disableGift(db, giftId, time("00:05"));
      await expect(repository.reserveGiftPublicationPromotion(db, { giftId, sessionId: "promotion", ownerEmail, objectKeys: finalKeys(), now: time("00:06") })).rejects.toBeInstanceOf(repository.GiftPublicationUnavailableError);
    } finally { await close(); }
  });

  it.each(["expired", "committed"])("reopens terminal temp media and cover after an %s publication", async mode => {
    const { db, close } = createBackendTestDatabase();
    const store = mediaStore();
    try {
      await migrateBackendDatabase(db);
      await seed(db);
      const payload = album();
      payload.media[0].objectKey = `gifts/${giftId}/temporary/temp/photo`;
      payload.cover!.objectKey = `gifts/${giftId}/temporary/temp/cover`;
      const keys = [payload.media[0].objectKey, payload.cover!.objectKey];
      await repository.createGiftPublishSession(db, { id: "temporary", giftId, ownerEmail, baseVersion: 0, payload, createdAt: time("00:02"), expiresAt: time("00:17") });
      await db.insert(giftMediaCleanupJobs).values(keys.map((objectKey, index) => ({ id: `temp-${index}`, giftId, objectKey, state: "dead_letter", attempts: 10, nextAttemptAt: time("00:02"), leaseUntil: null, lastError: "r2_delete_failed", completedAt: time("00:03"), createdAt: time("00:02") })));
      if (mode === "expired") await repository.expireGiftPublishSessions(db, time("00:18"));
      else await repository.completeGiftPublishSession(db, { sessionId: "temporary", ownerEmail, payload: album(), now: time("00:04") });
      expect((await db.select().from(giftMediaCleanupJobs)).every(job => job.state === "pending" && job.attempts === 0 && job.completedAt === null)).toBe(true);
      await maintain(db, store, "01:00");
      for (const key of keys) expect(store.deleteObjects).toHaveBeenCalledWith([key], { abortSignal: expect.any(AbortSignal) });
      expect(store.deleteObjects).toHaveBeenCalledTimes(2);
    } finally { await close(); }
  });

  it("retains main account-deletion inventory for completed referenced finals", async () => {
    const { db, close } = createBackendTestDatabase();
    const store = mediaStore();
    try {
      await migrateBackendDatabase(db);
      const user = await createOrGetUserByEmail(db, ownerEmail, time("00:00"));
      await createAuthSession(db, { id: "deletion-session", userId: user.id, tokenHash: "synthetic-session", createdAt: time("00:00"), expiresAt: time("23:00") });
      await seed(db);
      await repository.enqueueGiftMediaCleanupJobs(db, giftId, finalKeys(), time("00:03"));
      await publish(db);
      await maintain(db, store, "01:00");
      await createAccountDeletionChallenge(db, { id: "challenge", userId: user.id, sessionId: "deletion-session", codeHash: "synthetic-hash", createdAt: time("01:01"), expiresAt: time("01:06") });
      await expect(acceptAccountDeletion(db, { challengeId: "challenge", userId: user.id, sessionId: "deletion-session", codeHash: "synthetic-hash", confirmation: "DELETE", receiptId: "receipt", now: time("01:02"), completeBy: time("23:00") })).resolves.toMatchObject({ status: "accepted" });
      expect((await db.select().from(accountDeletionMediaObjects)).map(item => item.objectKey).sort()).toEqual(finalKeys().sort());
      await expect(processAccountDeletionJobs({ db, store, now: new Date(time("02:00")), notifyFailure: jest.fn() })).resolves.toMatchObject({ completed: 1, failed: 0 });
      expect(store.deleteObjects).toHaveBeenCalledWith(finalKeys().sort(), { abortSignal: expect.any(AbortSignal) });
      expect(await db.select().from(gifts)).toEqual([]);
      expect(await db.select().from(giftMediaCleanupJobs)).toEqual([]);
      expect(await db.select().from(accountDeletionJobs)).toEqual([expect.objectContaining({ state: "completed", userId: null, accountEmail: null })]);
    } finally { await close(); }
  });
});
