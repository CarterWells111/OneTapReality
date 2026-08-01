import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";
import { addGiftMember, claimGiftByTokenHash, completeGiftPublishSession, createGift, createGiftEmailCode, createGiftPublishSession, disableGift, getGiftAccessByTokenHash, getGiftStatusByTokenHash, getOwnedGiftById, getSharedAlbumSnapshot, listGiftMediaCleanupJobs, listGiftMembers, listOwnedGifts, consumeGiftEmailCode, createGiftSession, getGiftSessionEmail, removeGiftMember } from "../src/server/gifts/repository";

describe("gift repository", () => {
  it("claims a pre-registered gift once and persists its owner", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "gift-1", tokenHash: "token-hash", createdAt: "2026-07-24T00:00:00.000Z" });

      await expect(claimGiftByTokenHash(db, "token-hash", "owner@example.com", "2026-07-24T00:01:00.000Z"))
        .resolves.toEqual(expect.objectContaining({ status: "bound", ownerEmail: "owner@example.com" }));
      await expect(claimGiftByTokenHash(db, "token-hash", "other@example.com", "2026-07-24T00:02:00.000Z"))
        .resolves.toBeNull();
      await expect(listOwnedGifts(db, "OWNER@example.com")).resolves.toEqual([
        expect.objectContaining({ id: "gift-1", status: "bound" }),
      ]);
    } finally {
      await close();
    }
  });

  it("only reports the state of a registered gift token", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "gift-1", tokenHash: "known", createdAt: "2026-07-24T00:00:00.000Z" });

      await expect(getGiftStatusByTokenHash(db, "known")).resolves.toBe("unclaimed");
      await expect(getGiftStatusByTokenHash(db, "unknown")).resolves.toBeNull();
    } finally {
      await close();
    }
  });

  it("enforces the three-email access limit in persistent storage", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "gift-1", tokenHash: "known", createdAt: "2026-07-24T00:00:00.000Z" });
      await claimGiftByTokenHash(db, "known", "owner@example.com", "2026-07-24T00:01:00.000Z");

      await expect(addGiftMember(db, "gift-1", "one@example.com", "2026-07-24T00:02:00.000Z")).resolves.toBe(true);
      await expect(addGiftMember(db, "gift-1", "two@example.com", "2026-07-24T00:02:00.000Z")).resolves.toBe(true);
      await expect(addGiftMember(db, "gift-1", "three@example.com", "2026-07-24T00:02:00.000Z")).resolves.toBe(false);
      await expect(getGiftAccessByTokenHash(db, "known", "one@example.com")).resolves.toEqual(expect.objectContaining({ role: "viewer", status: "bound" }));
      await expect(getGiftAccessByTokenHash(db, "known", "unknown@example.com")).resolves.toBeNull();
      await expect(removeGiftMember(db, "gift-1", "one@example.com")).resolves.toBe(true);
      await expect(listGiftMembers(db, "gift-1")).resolves.toHaveLength(2);
    } finally {
      await close();
    }
  });

  it("consumes a matching unexpired email code only once", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGiftEmailCode(db, { id: "code-1", email: "owner@example.com", codeHash: "hash", expiresAt: "2026-07-24T00:05:00.000Z", createdAt: "2026-07-24T00:00:00.000Z" });

      await expect(consumeGiftEmailCode(db, "owner@example.com", "hash", "2026-07-24T00:01:00.000Z")).resolves.toBe(true);
      await expect(consumeGiftEmailCode(db, "owner@example.com", "hash", "2026-07-24T00:01:00.000Z")).resolves.toBe(false);
    } finally { await close(); }
  });

  it("returns an email only for an active unrevoked gift session", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGiftSession(db, { id: "session-1", email: "owner@example.com", tokenHash: "session-hash", expiresAt: "2026-08-23T00:00:00.000Z", createdAt: "2026-07-24T00:00:00.000Z" });
      await expect(getGiftSessionEmail(db, "session-hash", "2026-07-25T00:00:00.000Z")).resolves.toBe("owner@example.com");
      await expect(getGiftSessionEmail(db, "session-hash", "2026-08-24T00:00:00.000Z")).resolves.toBeNull();
    } finally { await close(); }
  });

  it("replaces a shared album only when a live owner publication session is completed", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "gift-1", tokenHash: "known", createdAt: "2026-07-24T00:00:00.000Z" });
      await claimGiftByTokenHash(db, "known", "owner@example.com", "2026-07-24T00:01:00.000Z");
      await createGiftPublishSession(db, { id: "publish-1", giftId: "gift-1", ownerEmail: "owner@example.com", createdAt: "2026-07-24T00:02:00.000Z", expiresAt: "2026-07-24T00:12:00.000Z", payload: { sourceMemoryId: "memory-1", title: "Summer", pages: [{ position: 0, page: { headline: "Hello" } }], media: [{ position: 0, objectKey: "gifts/gift-1/photo.jpg", contentType: "image/jpeg", byteSize: 42 }] } });

      const result = await completeGiftPublishSession(db, { sessionId: "publish-1", ownerEmail: "owner@example.com", now: "2026-07-24T00:03:00.000Z" });
      expect(result).toEqual(expect.objectContaining({ oldObjectKeys: [] }));
      await expect(getSharedAlbumSnapshot(db, result!.albumId)).resolves.toEqual(expect.objectContaining({ album: expect.objectContaining({ title: "Summer", version: 1 }), media: [expect.objectContaining({ objectKey: "gifts/gift-1/photo.jpg" })] }));
      await expect(completeGiftPublishSession(db, { sessionId: "publish-1", ownerEmail: "owner@example.com", now: "2026-07-24T00:04:00.000Z" })).resolves.toBeNull();
    } finally { await close(); }
  });

  it("serializes concurrent publication sessions for the same gift", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "gift-1", tokenHash: "known", createdAt: "2026-07-24T00:00:00.000Z" });
      await claimGiftByTokenHash(db, "known", "owner@example.com", "2026-07-24T00:01:00.000Z");
      for (const [id, title] of [["publish-1", "First"], ["publish-2", "Second"]] as const) {
        await createGiftPublishSession(db, {
          id, giftId: "gift-1", ownerEmail: "owner@example.com", createdAt: "2026-07-24T00:02:00.000Z", expiresAt: "2026-07-24T00:12:00.000Z",
          payload: { sourceMemoryId: id, title, pages: [], media: [] },
        });
      }

      const results = await Promise.allSettled([
        completeGiftPublishSession(db, { sessionId: "publish-1", ownerEmail: "owner@example.com", now: "2026-07-24T00:03:00.000Z" }),
        completeGiftPublishSession(db, { sessionId: "publish-2", ownerEmail: "owner@example.com", now: "2026-07-24T00:03:01.000Z" }),
      ]);

      expect(results.every((result) => result.status === "fulfilled" && result.value !== null)).toBe(true);
      const latest = results[1].status === "fulfilled" ? results[1].value : null;
      await expect(getSharedAlbumSnapshot(db, latest!.albumId)).resolves.toEqual(expect.objectContaining({ album: expect.objectContaining({ version: 2 }) }));
    } finally { await close(); }
  });

  it("keeps management lookup internal to the owner and queues private media cleanup on permanent disable", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "gift-1", tokenHash: "known", createdAt: "2026-07-24T00:00:00.000Z" });
      await claimGiftByTokenHash(db, "known", "owner@example.com", "2026-07-24T00:01:00.000Z");
      await createGiftPublishSession(db, { id: "publish-1", giftId: "gift-1", ownerEmail: "owner@example.com", createdAt: "2026-07-24T00:02:00.000Z", expiresAt: "2026-07-24T00:12:00.000Z", payload: { sourceMemoryId: "memory-1", title: "Summer", pages: [], media: [{ position: 0, objectKey: "gifts/gift-1/photo.jpg", contentType: "image/jpeg", byteSize: 42 }] } });
      await completeGiftPublishSession(db, { sessionId: "publish-1", ownerEmail: "owner@example.com", now: "2026-07-24T00:03:00.000Z" });

      await expect(getOwnedGiftById(db, "gift-1", "owner@example.com")).resolves.toEqual(expect.objectContaining({ id: "gift-1" }));
      await expect(getOwnedGiftById(db, "gift-1", "other@example.com")).resolves.toBeNull();
      await expect(disableGift(db, "gift-1", "2026-07-24T00:04:00.000Z")).resolves.toBe(true);
      await expect(getGiftAccessByTokenHash(db, "known", "owner@example.com")).resolves.toBeNull();
      await expect(listGiftMediaCleanupJobs(db, "2026-07-24T00:04:00.000Z")).resolves.toEqual([
        expect.objectContaining({ objectKey: "gifts/gift-1/photo.jpg", state: "pending" }),
      ]);
    } finally { await close(); }
  });
});
