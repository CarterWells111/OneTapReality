import { eq } from "drizzle-orm";

import { createOrGetUserByEmail } from "../src/server/auth/repository";
import type { BackendDatabase } from "../src/server/db/client";
import { giftMediaCleanupJobs, giftPublishSessions, sharedAlbums, users } from "../src/server/db/schema";
import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";
import * as repository from "../src/server/gifts/repository";
import type { GiftPublicationPayload } from "../src/server/gifts/repository";
import type { PrivateMediaStore } from "../src/server/gifts/r2-media";
import { finalizeSharedPublication } from "../src/server/gifts/shared-publication";
import { runGiftMaintenance } from "../src/server/maintenance/run-gift-maintenance";

const giftId = "synthetic-cleanup-race";
const sessionId = "synthetic-publication";
const ownerEmail = "owner@example.test";
const time = (clock: string) => `2026-10-07T${clock}:00.000Z`;
const key = (phase: "temp" | "final", kind: "photo" | "cover") => `gifts/${giftId}/${sessionId}/${phase}/${kind}`;
const finalKeys = [key("final", "photo"), key("final", "cover")];

async function seed(db: BackendDatabase) {
  await migrateBackendDatabase(db);
  const user = await createOrGetUserByEmail(db, ownerEmail, time("00:00"));
  await repository.createGift(db, { id: giftId, tokenHash: "synthetic-token", createdAt: time("00:00") });
  await repository.claimGiftByTokenHash(db, "synthetic-token", ownerEmail, time("00:01"));
  const payload: GiftPublicationPayload = {
    sourceMemoryId: "synthetic", title: "Synthetic trip", travelDate: "2026-10-07", pages: [],
    media: [{ position: 0, objectKey: key("temp", "photo"), contentType: "image/jpeg", byteSize: 12, source: "upload" }],
    cover: { objectKey: key("temp", "cover"), contentType: "image/jpeg", byteSize: 12 },
  };
  await repository.createGiftPublishSession(db, {
    id: sessionId, giftId, ownerEmail, baseVersion: 0, payload,
    createdAt: time("00:02"), expiresAt: time("00:32"),
  });
  await reserve(db, "00:02");
  return user;
}

function reserve(db: BackendDatabase, clock: string) {
  return repository.reserveGiftPublicationPromotion(db, { giftId, sessionId, ownerEmail, objectKeys: finalKeys, now: time(clock) });
}

function createStore(objects = new Set<string>()): PrivateMediaStore {
  return {
    createUploadUrl: jest.fn(), createReadUrl: jest.fn(),
    getObjectMetadata: jest.fn(async objectKey => objects.has(objectKey) ? { contentType: "image/jpeg", byteSize: 12 } : null),
    objectExists: jest.fn(async objectKey => objects.has(objectKey)),
    copyObject: jest.fn(async (source, target) => {
      if (!objects.has(source)) throw new Error("Synthetic source is missing");
      objects.add(target);
    }),
    deleteObjects: jest.fn(async objectKeys => { objectKeys.forEach(objectKey => objects.delete(objectKey)); }),
  };
}

function finalize(db: BackendDatabase, store: PrivateMediaStore, clock = "00:20", email = ownerEmail) {
  return finalizeSharedPublication({ db, store, giftId, sessionId, ownerEmail: email, now: time(clock) });
}

describe("P1 publication retry versus cleanup", () => {
  it.each(["photo", "cover"] as const)("blocks finalization during %s deletion, then recopies safely using the same session and receipt", async kind => {
    const { db, close } = createBackendTestDatabase();
    const objects = new Set([key("temp", "photo"), key("temp", "cover"), key("final", kind)]);
    const store = createStore(objects);
    let retryError: unknown;
    let unexpectedReceipt: unknown;
    try {
      await seed(db);
      const otherKey = key("final", kind === "photo" ? "cover" : "photo");
      await db.update(giftMediaCleanupJobs).set({ state: "completed", completedAt: time("00:18") }).where(eq(giftMediaCleanupJobs.objectKey, otherKey));
      const before = await db.select().from(giftMediaCleanupJobs);
      store.deleteObjects = jest.fn(async objectKeys => {
        if (objectKeys.includes(key("final", kind))) {
          try { unexpectedReceipt = await finalize(db, store); } catch (error) { retryError = error; }
        }
        objectKeys.forEach(objectKey => objects.delete(objectKey));
      });
      await runGiftMaintenance({ db, store, mode: "scheduled", now: new Date(time("00:20")), sendContentReportNotice: jest.fn() });
      expect(unexpectedReceipt).toBeUndefined();
      expect(retryError).toMatchObject({ status: 503, code: "gift_publication_retryable", headers: { "Retry-After": "2" } });
      expect(store.getObjectMetadata).not.toHaveBeenCalled();
      expect(store.copyObject).not.toHaveBeenCalled();
      expect(await db.select().from(sharedAlbums)).toEqual([]);
      expect(await db.select().from(giftPublishSessions)).toEqual([expect.objectContaining({ id: sessionId, completedAt: null })]);

      const receipt = await finalize(db, store, "00:21");
      expect(receipt).toMatchObject({ version: 1 });
      expect(store.copyObject).toHaveBeenCalledTimes(2);
      expect(finalKeys.every(objectKey => objects.has(objectKey))).toBe(true);
      expect(await repository.getSharedAlbumSnapshot(db, receipt.albumId)).toMatchObject({ album: { travelDate: "2026-10-07", coverObjectKey: key("final", "cover") }, media: [{ objectKey: key("final", "photo") }] });
      const after = await db.select().from(giftMediaCleanupJobs);
      for (const original of before) expect(after.find(job => job.id === original.id)).toMatchObject({ state: "pending", nextAttemptAt: time("00:36"), attempts: 0, completedAt: null });
      await expect(finalize(db, store, "00:22")).resolves.toEqual(receipt);
      expect(store.copyObject).toHaveBeenCalledTimes(2);
    } finally { await close(); }
  });

  it("extends due pending candidates while preserving identity, attempts and later backoff", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await seed(db);
      await db.update(giftMediaCleanupJobs).set({ attempts: 3, lastError: "r2_delete_failed" });
      await db.update(giftMediaCleanupJobs).set({ nextAttemptAt: time("00:50") }).where(eq(giftMediaCleanupJobs.objectKey, key("final", "cover")));
      const before = await db.select().from(giftMediaCleanupJobs);
      await reserve(db, "00:20");
      const after = await db.select().from(giftMediaCleanupJobs);
      for (const original of before) expect(after.find(job => job.id === original.id)).toEqual({ ...original, nextAttemptAt: original.objectKey.endsWith("/cover") ? time("00:50") : time("00:35") });
      expect(await repository.claimGiftMediaCleanupJobs(db, time("00:20"), time("00:25"))).toEqual([]);
      expect(await repository.claimGiftMediaCleanupJobs(db, time("00:36"), time("00:41"))).toEqual([expect.objectContaining({ objectKey: key("final", "photo"), attempts: 4 })]);
    } finally { await close(); }
  });

  it("does not claim candidates delayed after selection", async () => {
    const { db, close } = createBackendTestDatabase();
    let spy: jest.SpyInstance | undefined;
    try {
      await seed(db);
      const realTransaction = db.transaction.bind(db);
      let delayed = false;
      spy = jest.spyOn(db, "transaction").mockImplementation((callback, config) => realTransaction(async tx => {
        const execute = tx.execute.bind(tx);
        tx.execute = (async (...args: Parameters<typeof tx.execute>) => {
          const selected = await execute(...args);
          if (!delayed) {
            delayed = true;
            await reserve(db, "00:20");
          }
          return selected;
        }) as typeof tx.execute;
        return callback(tx);
      }, config));
      expect(await repository.claimGiftMediaCleanupJobs(db, time("00:20"), time("00:25"))).toEqual([]);
      expect((await db.select().from(giftMediaCleanupJobs)).every(job => job.state === "pending" && job.nextAttemptAt === time("00:35") && job.attempts === 0)).toBe(true);
    } finally { spy?.mockRestore(); await close(); }
  });

  it.each(["unauthorized", "expired", "account_deletion", "disabled", "version_conflict"] as const)("retains the existing %s publication boundary", async boundary => {
    const { db, close } = createBackendTestDatabase();
    const objects = new Set([key("temp", "photo"), key("temp", "cover")]);
    const store = createStore(objects);
    try {
      const user = await seed(db);
      if (boundary === "account_deletion") await db.update(users).set({ deletionState: "pending", deletionRequestedAt: time("00:19") }).where(eq(users.id, user.id));
      if (boundary === "disabled") await repository.disableGift(db, giftId, time("00:19"));
      if (boundary === "version_conflict") {
        await repository.createGiftPublishSession(db, { id: "newer", giftId, ownerEmail, baseVersion: 0, payload: { sourceMemoryId: "newer", title: "Newer", pages: [], media: [] }, createdAt: time("00:18"), expiresAt: time("00:48") });
        await repository.completeGiftPublishSession(db, { sessionId: "newer", ownerEmail, now: time("00:19") });
      }
      await expect(finalize(db, store, boundary === "expired" ? "00:33" : "00:20", boundary === "unauthorized" ? "unrelated@example.test" : ownerEmail)).rejects.toMatchObject({ code: boundary === "version_conflict" ? "gift_album_version_conflict" : "gift_publication_unavailable" });
      if (boundary !== "version_conflict") expect(store.copyObject).not.toHaveBeenCalled();
      expect(await db.select().from(giftPublishSessions).where(eq(giftPublishSessions.id, sessionId))).toEqual([expect.objectContaining({ completedAt: null })]);
    } finally { await close(); }
  });
});
