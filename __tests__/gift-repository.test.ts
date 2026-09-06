import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";
import { addGiftMember, activateGiftViewerByTokenHash, claimGiftByTokenHash, completeGiftPublishSession, createGift, createGiftEmailCode, createGiftPublishSession, disableGift, getActivatedGiftAccessByGiftId, getGiftAccessByTokenHash, getGiftPublishPayload, getGiftStatusByTokenHash, getOwnedGiftById, getSharedAlbumSnapshot, listGiftMediaCleanupJobs, listGiftMembers, listInvitedGifts, listOwnedGifts, consumeGiftEmailCode, createGiftSession, getGiftSessionEmail, removeGiftMember, updateGiftMemberRole } from "../src/server/gifts/repository";
import { users } from "../src/server/db/schema";

describe("gift repository", () => {
  it("scopes active publication payload lookup to gift, actor, expiry, and completion", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "gift-1", tokenHash: "publish-token", createdAt: "2026-09-06T00:00:00.000Z" });
      await createGiftPublishSession(db, {
        id: "publish-1", giftId: "gift-1", ownerEmail: "Owner@Example.com", baseVersion: 0,
        createdAt: "2026-09-06T00:00:00.000Z", expiresAt: "2026-09-06T00:30:00.000Z",
        payload: { sourceMemoryId: "memory", title: "Trip", pages: [], media: [] },
      });

      await expect(getGiftPublishPayload(db, "publish-1", "gift-1", "owner@example.com", "2026-09-06T00:10:00.000Z"))
        .resolves.toEqual(expect.objectContaining({ title: "Trip" }));
      await expect(getGiftPublishPayload(db, "publish-1", "gift-2", "owner@example.com", "2026-09-06T00:10:00.000Z"))
        .resolves.toBeNull();
      await expect(getGiftPublishPayload(db, "publish-1", "gift-1", "other@example.com", "2026-09-06T00:10:00.000Z"))
        .resolves.toBeNull();
      await expect(getGiftPublishPayload(db, "publish-1", "gift-1", "owner@example.com", "2026-09-06T00:31:00.000Z"))
        .resolves.toBeNull();
    } finally { await close(); }
  });

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

  it("replaces a shared album only when a live owner publication session is completed", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "gift-1", tokenHash: "known", createdAt: "2026-07-24T00:00:00.000Z" });
      await claimGiftByTokenHash(db, "known", "owner@example.com", "2026-07-24T00:01:00.000Z");
      await createGiftPublishSession(db, { id: "publish-1", giftId: "gift-1", ownerEmail: "owner@example.com", baseVersion: 0, createdAt: "2026-07-24T00:02:00.000Z", expiresAt: "2026-07-24T00:12:00.000Z", payload: { sourceMemoryId: "memory-1", title: "Summer", pages: [{ position: 0, page: { headline: "Hello" } }], media: [{ position: 0, objectKey: "gifts/gift-1/photo.jpg", contentType: "image/jpeg", byteSize: 42 }] } });

      const result = await completeGiftPublishSession(db, { sessionId: "publish-1", ownerEmail: "owner@example.com", now: "2026-07-24T00:03:00.000Z" });
      expect(result).toEqual(expect.objectContaining({ oldObjectKeys: [] }));
      await expect(getSharedAlbumSnapshot(db, result!.albumId)).resolves.toEqual(expect.objectContaining({ album: expect.objectContaining({ title: "Summer", version: 1 }), media: [expect.objectContaining({ objectKey: "gifts/gift-1/photo.jpg" })] }));
      await expect(completeGiftPublishSession(db, { sessionId: "publish-1", ownerEmail: "owner@example.com", now: "2026-07-24T00:04:00.000Z" })).resolves.toBeNull();
    } finally { await close(); }
  });

  it("persists a travel date when replacing a legacy shared album", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "gift-1", tokenHash: "known", createdAt: "2026-08-21T00:00:00.000Z" });
      await claimGiftByTokenHash(db, "known", "owner@example.com", "2026-08-21T00:01:00.000Z");
      await createGiftPublishSession(db, { id: "legacy", giftId: "gift-1", ownerEmail: "owner@example.com", baseVersion: 0, createdAt: "2026-08-21T00:02:00.000Z", expiresAt: "2026-08-21T00:12:00.000Z", payload: { sourceMemoryId: "memory", title: "Legacy", pages: [], media: [] } });
      await completeGiftPublishSession(db, { sessionId: "legacy", ownerEmail: "owner@example.com", now: "2026-08-21T00:03:00.000Z" });
      await createGiftPublishSession(db, { id: "dated", giftId: "gift-1", ownerEmail: "owner@example.com", baseVersion: 1, createdAt: "2026-08-21T00:04:00.000Z", expiresAt: "2026-08-21T00:14:00.000Z", payload: { sourceMemoryId: "memory", title: "Updated", travelDate: "2026-08-21", pages: [], media: [] } });

      const result = await completeGiftPublishSession(db, { sessionId: "dated", ownerEmail: "owner@example.com", now: "2026-08-21T00:05:00.000Z" });
      await expect(getSharedAlbumSnapshot(db, result!.albumId)).resolves.toEqual(expect.objectContaining({ album: expect.objectContaining({ title: "Updated", travelDate: "2026-08-21", version: 2 }) }));
    } finally { await close(); }
  });

  it("preserves a date for an upgraded in-flight session but clears it when explicitly null", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "gift-1", tokenHash: "known", createdAt: "2026-08-21T00:00:00.000Z" });
      await claimGiftByTokenHash(db, "known", "owner@example.com", "2026-08-21T00:01:00.000Z");
      await createGiftPublishSession(db, { id: "initial", giftId: "gift-1", ownerEmail: "owner@example.com", baseVersion: 0, createdAt: "2026-08-21T00:02:00.000Z", expiresAt: "2026-08-21T00:12:00.000Z", payload: { sourceMemoryId: "memory", title: "Original", travelDate: "2026-08-21", pages: [], media: [] } });
      await completeGiftPublishSession(db, { sessionId: "initial", ownerEmail: "owner@example.com", now: "2026-08-21T00:03:00.000Z" });
      await createGiftPublishSession(db, { id: "upgraded", giftId: "gift-1", ownerEmail: "owner@example.com", baseVersion: 1, createdAt: "2026-08-21T00:04:00.000Z", expiresAt: "2026-08-21T00:14:00.000Z", payload: { sourceMemoryId: "memory", title: "Preserved", pages: [], media: [] } });
      const preserved = await completeGiftPublishSession(db, { sessionId: "upgraded", ownerEmail: "owner@example.com", now: "2026-08-21T00:05:00.000Z" });
      await expect(getSharedAlbumSnapshot(db, preserved!.albumId)).resolves.toEqual(expect.objectContaining({ album: expect.objectContaining({ travelDate: "2026-08-21", version: 2 }) }));
      await createGiftPublishSession(db, { id: "clear", giftId: "gift-1", ownerEmail: "owner@example.com", baseVersion: 2, createdAt: "2026-08-21T00:06:00.000Z", expiresAt: "2026-08-21T00:16:00.000Z", payload: { sourceMemoryId: "memory", title: "Cleared", travelDate: null, pages: [], media: [] } });
      const cleared = await completeGiftPublishSession(db, { sessionId: "clear", ownerEmail: "owner@example.com", now: "2026-08-21T00:07:00.000Z" });
      await expect(getSharedAlbumSnapshot(db, cleared!.albumId)).resolves.toEqual(expect.objectContaining({ album: expect.objectContaining({ travelDate: null, version: 3 }) }));
    } finally { await close(); }
  });

  it("commits the server-promoted payload and queues its session temp objects for durable cleanup", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "gift-1", tokenHash: "known", createdAt: "2026-08-16T00:00:00.000Z" });
      await claimGiftByTokenHash(db, "known", "owner@example.com", "2026-08-16T00:01:00.000Z");
      const tempKey = "gifts/gift-1/publish-1/temp/photo";
      const finalKey = "gifts/gift-1/publish-1/final/attempt-1/photo";
      await createGiftPublishSession(db, {
        id: "publish-1", giftId: "gift-1", ownerEmail: "owner@example.com", baseVersion: 0,
        createdAt: "2026-08-16T00:02:00.000Z", expiresAt: "2026-08-16T00:12:00.000Z",
        payload: { sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ position: 0, objectKey: tempKey, contentType: "image/jpeg", byteSize: 42, source: "upload" }] },
      });

      const result = await completeGiftPublishSession(db, {
        sessionId: "publish-1", ownerEmail: "owner@example.com", now: "2026-08-16T00:03:00.000Z",
        payload: { sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ position: 0, objectKey: finalKey, contentType: "image/jpeg", byteSize: 42, source: "upload" }] },
      });

      await expect(getSharedAlbumSnapshot(db, result!.albumId)).resolves.toEqual(expect.objectContaining({ media: [expect.objectContaining({ objectKey: finalKey })] }));
      await expect(listGiftMediaCleanupJobs(db, "2026-08-16T00:03:00.000Z")).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ objectKey: tempKey })]));
    } finally { await close(); }
  });

  it("keeps viewer gifts private until token activation and revokes activation with membership", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await db.insert(users).values({ id: "viewer-user", email: "viewer@example.com", createdAt: "2026-07-24T00:00:00.000Z", lastAuthenticatedAt: "2026-07-24T00:00:00.000Z" });
      await createGift(db, { id: "gift-1", tokenHash: "known", createdAt: "2026-07-24T00:00:00.000Z" });
      await claimGiftByTokenHash(db, "known", "owner@example.com", "2026-07-24T00:01:00.000Z");
      await addGiftMember(db, "gift-1", "viewer@example.com", "2026-07-24T00:02:00.000Z");

      await expect(listInvitedGifts(db, "viewer-user", "viewer@example.com")).resolves.toEqual([]);
      await expect(getActivatedGiftAccessByGiftId(db, "gift-1", "viewer-user", "viewer@example.com")).resolves.toBeNull();
      await expect(activateGiftViewerByTokenHash(db, "wrong", { id: "viewer-user", email: "viewer@example.com" }, "2026-07-24T00:03:00.000Z")).resolves.toBeNull();
      await expect(activateGiftViewerByTokenHash(db, "known", { id: "viewer-user", email: "other@example.com" }, "2026-07-24T00:03:00.000Z")).resolves.toBeNull();
      await expect(activateGiftViewerByTokenHash(db, "known", { id: "viewer-user", email: "viewer@example.com" }, "2026-07-24T00:03:00.000Z")).resolves.toEqual({ giftId: "gift-1", role: "viewer", albumPublished: false });
      await expect(listInvitedGifts(db, "viewer-user", "viewer@example.com")).resolves.toEqual([expect.objectContaining({ giftId: "gift-1", role: "viewer" })]);

      await removeGiftMember(db, "gift-1", "viewer@example.com");
      await addGiftMember(db, "gift-1", "viewer@example.com", "2026-07-24T00:04:00.000Z");
      await expect(listInvitedGifts(db, "viewer-user", "viewer@example.com")).resolves.toEqual([]);
    } finally { await close(); }
  });

  it("preserves activation while an owner switches a member between viewer and editor", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await db.insert(users).values({ id: "editor-user", email: "editor@example.com", createdAt: "2026-08-16T00:00:00.000Z", lastAuthenticatedAt: "2026-08-16T00:00:00.000Z" });
      await createGift(db, { id: "gift-1", tokenHash: "known", createdAt: "2026-08-16T00:00:00.000Z" });
      await claimGiftByTokenHash(db, "known", "owner@example.com", "2026-08-16T00:01:00.000Z");
      await expect(addGiftMember(db, "gift-1", "editor@example.com", "2026-08-16T00:02:00.000Z", "editor")).resolves.toBe(true);
      await expect(activateGiftViewerByTokenHash(db, "known", { id: "editor-user", email: "editor@example.com" }, "2026-08-16T00:03:00.000Z")).resolves.toEqual({ giftId: "gift-1", role: "editor", albumPublished: false });
      await expect(getActivatedGiftAccessByGiftId(db, "gift-1", "editor-user", "editor@example.com")).resolves.toEqual(expect.objectContaining({ role: "editor" }));
      await expect(updateGiftMemberRole(db, "gift-1", "editor@example.com", "viewer")).resolves.toBe(true);
      await expect(getActivatedGiftAccessByGiftId(db, "gift-1", "editor-user", "editor@example.com")).resolves.toEqual(expect.objectContaining({ role: "viewer" }));
      await expect(updateGiftMemberRole(db, "gift-1", "editor@example.com", "owner" as never)).resolves.toBe(false);
    } finally { await close(); }
  });

  it("publishes a chosen cover, exposes it to viewers and owners, and queues old covers for cleanup", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "gift-1", tokenHash: "known", createdAt: "2026-07-24T00:00:00.000Z" });
      await claimGiftByTokenHash(db, "known", "owner@example.com", "2026-07-24T00:01:00.000Z");
      await addGiftMember(db, "gift-1", "viewer@example.com", "2026-07-24T00:02:00.000Z");
      await createGiftPublishSession(db, {
        id: "publish-1", giftId: "gift-1", ownerEmail: "owner@example.com", baseVersion: 0, createdAt: "2026-07-24T00:02:00.000Z", expiresAt: "2026-07-24T00:12:00.000Z",
        payload: {
          sourceMemoryId: "memory-1", title: "Summer", pages: [{ position: 0, page: { headline: "Hello" } }],
          media: [{ position: 0, objectKey: "gifts/gift-1/photo.jpg", contentType: "image/jpeg", byteSize: 42 }],
          cover: { objectKey: "gifts/gift-1/cover.jpg", contentType: "image/jpeg", byteSize: 24 },
        },
      });

      const first = await completeGiftPublishSession(db, { sessionId: "publish-1", ownerEmail: "owner@example.com", now: "2026-07-24T00:03:00.000Z" });
      const snapshot = await getSharedAlbumSnapshot(db, first!.albumId);
      expect(snapshot!.album).toEqual(expect.objectContaining({
        coverObjectKey: "gifts/gift-1/cover.jpg",
        coverContentType: "image/jpeg",
        coverByteSize: 24,
      }));
      await db.insert(users).values({ id: "viewer-user", email: "viewer@example.com", createdAt: "2026-07-24T00:00:00.000Z", lastAuthenticatedAt: "2026-07-24T00:00:00.000Z" });
      await activateGiftViewerByTokenHash(db, "known", { id: "viewer-user", email: "viewer@example.com" }, "2026-07-24T00:03:00.000Z");
      await expect(listInvitedGifts(db, "viewer-user", "VIEWER@example.com")).resolves.toEqual([
        expect.objectContaining({ giftId: "gift-1", albumId: expect.any(String), albumTitle: "Summer", coverObjectKey: "gifts/gift-1/cover.jpg" }),
      ]);
      await expect(listOwnedGifts(db, "owner@example.com")).resolves.toEqual([
        expect.objectContaining({ id: "gift-1", albumId: expect.any(String), albumTitle: "Summer", coverObjectKey: "gifts/gift-1/cover.jpg" }),
      ]);
      await expect(getActivatedGiftAccessByGiftId(db, "gift-1", "viewer-user", "viewer@example.com")).resolves.toEqual(expect.objectContaining({ role: "viewer", albumId: expect.any(String) }));

      await createGiftPublishSession(db, {
        id: "publish-2", giftId: "gift-1", ownerEmail: "owner@example.com", baseVersion: 1, createdAt: "2026-07-24T00:04:00.000Z", expiresAt: "2026-07-24T00:14:00.000Z",
        payload: {
          sourceMemoryId: "memory-1", title: "Summer 2", pages: [],
          media: [{ position: 0, objectKey: "gifts/gift-1/photo.jpg", contentType: "image/jpeg", byteSize: 42 }],
          cover: { objectKey: "gifts/gift-1/cover2.jpg", contentType: "image/jpeg", byteSize: 24 },
        },
      });
      await completeGiftPublishSession(db, { sessionId: "publish-2", ownerEmail: "owner@example.com", now: "2026-07-24T00:05:00.000Z" });
      const replacementCleanup = await listGiftMediaCleanupJobs(db, "2026-07-24T00:05:00.000Z");
      expect(replacementCleanup).toEqual(expect.arrayContaining([expect.objectContaining({ objectKey: "gifts/gift-1/cover.jpg" })]));
      expect(replacementCleanup).not.toEqual(expect.arrayContaining([expect.objectContaining({ objectKey: "gifts/gift-1/photo.jpg" })]));

      await expect(disableGift(db, "gift-1", "2026-07-24T00:06:00.000Z")).resolves.toBe(true);
      await expect(listGiftMediaCleanupJobs(db, "2026-07-24T00:06:00.000Z")).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ objectKey: "gifts/gift-1/cover2.jpg" }),
      ]));
    } finally { await close(); }
  });

  it("rejects a stale concurrent publication session for the same gift", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "gift-1", tokenHash: "known", createdAt: "2026-07-24T00:00:00.000Z" });
      await claimGiftByTokenHash(db, "known", "owner@example.com", "2026-07-24T00:01:00.000Z");
      for (const [id, title] of [["publish-1", "First"], ["publish-2", "Second"]] as const) {
        await createGiftPublishSession(db, {
          id, giftId: "gift-1", ownerEmail: "owner@example.com", baseVersion: 0, createdAt: "2026-07-24T00:02:00.000Z", expiresAt: "2026-07-24T00:12:00.000Z",
          payload: { sourceMemoryId: id, title, pages: [], media: [] },
        });
      }

      const results = await Promise.allSettled([
        completeGiftPublishSession(db, { sessionId: "publish-1", ownerEmail: "owner@example.com", now: "2026-07-24T00:03:00.000Z" }),
        completeGiftPublishSession(db, { sessionId: "publish-2", ownerEmail: "owner@example.com", now: "2026-07-24T00:03:01.000Z" }),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    } finally { await close(); }
  });

  it("allows only one publication to win when two sessions share the same base version", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "gift-1", tokenHash: "known", createdAt: "2026-08-16T00:00:00.000Z" });
      await claimGiftByTokenHash(db, "known", "owner@example.com", "2026-08-16T00:01:00.000Z");
      for (const id of ["publish-1", "publish-2"]) await createGiftPublishSession(db, {
        id, giftId: "gift-1", ownerEmail: "owner@example.com", baseVersion: 0,
        createdAt: "2026-08-16T00:02:00.000Z", expiresAt: "2026-08-16T00:12:00.000Z",
        payload: { sourceMemoryId: id, title: id, pages: [], media: [] },
      });
      const results = await Promise.allSettled([
        completeGiftPublishSession(db, { sessionId: "publish-1", ownerEmail: "owner@example.com", now: "2026-08-16T00:03:00.000Z" }),
        completeGiftPublishSession(db, { sessionId: "publish-2", ownerEmail: "owner@example.com", now: "2026-08-16T00:03:01.000Z" }),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toEqual([
        expect.objectContaining({ reason: expect.objectContaining({ code: "gift_album_version_conflict" }) }),
      ]);
    } finally { await close(); }
  });

  it("rejects an editor publication when the member is downgraded before completion", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await db.insert(users).values({ id: "editor-user", email: "editor@example.com", createdAt: "2026-08-16T00:00:00.000Z", lastAuthenticatedAt: "2026-08-16T00:00:00.000Z" });
      await createGift(db, { id: "gift-1", tokenHash: "known", createdAt: "2026-08-16T00:00:00.000Z" });
      await claimGiftByTokenHash(db, "known", "owner@example.com", "2026-08-16T00:01:00.000Z");
      await addGiftMember(db, "gift-1", "editor@example.com", "2026-08-16T00:02:00.000Z", "editor");
      await activateGiftViewerByTokenHash(db, "known", { id: "editor-user", email: "editor@example.com" }, "2026-08-16T00:03:00.000Z");
      const access = await getActivatedGiftAccessByGiftId(db, "gift-1", "editor-user", "editor@example.com");
      await createGiftPublishSession(db, { id: "editor-publish", giftId: "gift-1", ownerEmail: "editor@example.com", memberId: access!.memberId, actorUserId: "editor-user", baseVersion: 0, createdAt: "2026-08-16T00:04:00.000Z", expiresAt: "2026-08-16T00:14:00.000Z", payload: { sourceMemoryId: "memory", title: "Editor", pages: [], media: [] } });
      await updateGiftMemberRole(db, "gift-1", "editor@example.com", "viewer");
      await expect(completeGiftPublishSession(db, { sessionId: "editor-publish", ownerEmail: "editor@example.com", now: "2026-08-16T00:05:00.000Z" })).resolves.toBeNull();
    } finally { await close(); }
  });

  it("keeps management lookup internal to the owner and queues private media cleanup on permanent disable", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "gift-1", tokenHash: "known", createdAt: "2026-07-24T00:00:00.000Z" });
      await claimGiftByTokenHash(db, "known", "owner@example.com", "2026-07-24T00:01:00.000Z");
      await createGiftPublishSession(db, { id: "publish-1", giftId: "gift-1", ownerEmail: "owner@example.com", baseVersion: 0, createdAt: "2026-07-24T00:02:00.000Z", expiresAt: "2026-07-24T00:12:00.000Z", payload: { sourceMemoryId: "memory-1", title: "Summer", pages: [], media: [{ position: 0, objectKey: "gifts/gift-1/photo.jpg", contentType: "image/jpeg", byteSize: 42 }] } });
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
