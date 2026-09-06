import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";
import { users } from "../src/server/db/schema";
import {
  activateGiftViewerByTokenHash,
  addGiftMember,
  claimGiftByTokenHash,
  completeGiftPublishSession,
  createGift,
  createGiftPublishSession,
  getActivatedGiftAccessByGiftId,
  getSharedAlbumSnapshot,
} from "../src/server/gifts/repository";

describe("Beta and Development shared staging gift state", () => {
  it("reads one server gift, album identity, and incrementing version from both clients", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, {
        id: "gift-1",
        tokenHash: "known",
        createdAt: "2026-09-05T10:00:00.000Z",
      });
      await claimGiftByTokenHash(
        db,
        "known",
        "owner@example.com",
        "2026-09-05T10:01:00.000Z",
      );
      await createGiftPublishSession(db, {
        id: "publish-1",
        giftId: "gift-1",
        ownerEmail: "owner@example.com",
        baseVersion: 0,
        createdAt: "2026-09-05T10:02:00.000Z",
        expiresAt: "2026-09-05T10:12:00.000Z",
        payload: {
          sourceMemoryId: "beta-local-memory",
          title: "Beta album",
          pages: [{ position: 0, page: { headline: "Shared page" } }],
          media: [{
            position: 0,
            objectKey: "gifts/gift-1/beta-photo.jpg",
            contentType: "image/jpeg",
            byteSize: 42,
          }],
        },
      });
      const first = await completeGiftPublishSession(db, {
        sessionId: "publish-1",
        ownerEmail: "owner@example.com",
        now: "2026-09-05T10:03:00.000Z",
      });
      const betaRead = await getSharedAlbumSnapshot(db, first!.albumId);
      const developmentRead = await getSharedAlbumSnapshot(db, first!.albumId);

      expect(betaRead!.album).toEqual(expect.objectContaining({
        id: first!.albumId,
        giftId: "gift-1",
        version: 1,
      }));
      expect(developmentRead!.album).toEqual(expect.objectContaining({
        id: betaRead!.album.id,
        giftId: betaRead!.album.giftId,
        version: betaRead!.album.version,
      }));
      expect(developmentRead!.pages).toHaveLength(1);
      expect(developmentRead!.media).toHaveLength(1);

      await createGiftPublishSession(db, {
        id: "publish-2",
        giftId: "gift-1",
        ownerEmail: "owner@example.com",
        baseVersion: 1,
        createdAt: "2026-09-05T10:04:00.000Z",
        expiresAt: "2026-09-05T10:14:00.000Z",
        payload: {
          sourceMemoryId: "development-local-memory",
          title: "Development update",
          pages: [],
          media: [],
        },
      });
      const second = await completeGiftPublishSession(db, {
        sessionId: "publish-2",
        ownerEmail: "owner@example.com",
        now: "2026-09-05T10:05:00.000Z",
      });
      const refreshedBetaRead = await getSharedAlbumSnapshot(db, second!.albumId);

      expect(second!.albumId).toBe(first!.albumId);
      expect(refreshedBetaRead!.album).toEqual(expect.objectContaining({
        id: first!.albumId,
        giftId: "gift-1",
        version: 2,
      }));
    } finally {
      await close();
    }
  });

  it("keeps an activated viewer read-only at the repository boundary", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await db.insert(users).values({
        id: "viewer-user",
        email: "viewer@example.com",
        createdAt: "2026-09-05T10:00:00.000Z",
        lastAuthenticatedAt: "2026-09-05T10:00:00.000Z",
      });
      await createGift(db, {
        id: "gift-1",
        tokenHash: "known",
        createdAt: "2026-09-05T10:00:00.000Z",
      });
      await claimGiftByTokenHash(db, "known", "owner@example.com", "2026-09-05T10:01:00.000Z");
      await addGiftMember(db, "gift-1", "viewer@example.com", "2026-09-05T10:02:00.000Z", "viewer");
      await activateGiftViewerByTokenHash(
        db,
        "known",
        { id: "viewer-user", email: "viewer@example.com" },
        "2026-09-05T10:03:00.000Z",
      );
      const access = await getActivatedGiftAccessByGiftId(
        db,
        "gift-1",
        "viewer-user",
        "viewer@example.com",
      );
      expect(access).toEqual(expect.objectContaining({ role: "viewer" }));

      await createGiftPublishSession(db, {
        id: "viewer-publish",
        giftId: "gift-1",
        ownerEmail: "viewer@example.com",
        memberId: access!.memberId,
        actorUserId: "viewer-user",
        baseVersion: 0,
        createdAt: "2026-09-05T10:04:00.000Z",
        expiresAt: "2026-09-05T10:14:00.000Z",
        payload: { sourceMemoryId: "viewer-memory", title: "Blocked", pages: [], media: [] },
      });
      await expect(completeGiftPublishSession(db, {
        sessionId: "viewer-publish",
        ownerEmail: "viewer@example.com",
        now: "2026-09-05T10:05:00.000Z",
      })).resolves.toBeNull();
    } finally {
      await close();
    }
  });
});
