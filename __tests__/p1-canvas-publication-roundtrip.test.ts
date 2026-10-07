import { collectPublicationSources, snapshotPagesForPublication } from "../src/features/gifts/publication-snapshot";
import { mapSharedAlbumToStoryPages } from "../src/features/gifts/shared-album-mapper";
import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";
import {
  claimGiftByTokenHash,
  completeGiftPublishSession,
  createGift,
  createGiftPublishSession,
  getSharedAlbumSnapshot,
  resolveExistingGiftMedia,
} from "../src/server/gifts/repository";
import type { StoryPage } from "../src/types/memory";

const image = (id: string, uri: string) => ({
  id, type: "image" as const, uri, x: 0.1, y: 0.2, width: 0.4, height: 0.5, rotation: 0.2, zIndex: 3,
  crop: { focusX: 0.3, focusY: 0.7, zoom: 2 },
});

describe("P1 existing-media publication roundtrip on main", () => {
  it("restores every photo and cover after real completion rebuilds media IDs and changes media positions", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createGift(db, { id: "test-gift", tokenHash: "synthetic-token-hash", createdAt: "2026-10-07T00:00:00.000Z" });
      await claimGiftByTokenHash(db, "synthetic-token-hash", "owner@example.test", "2026-10-07T00:01:00.000Z");
      await createGiftPublishSession(db, {
        id: "first-publication", giftId: "test-gift", ownerEmail: "owner@example.test", baseVersion: 0,
        createdAt: "2026-10-07T00:02:00.000Z", expiresAt: "2026-10-07T00:32:00.000Z",
        payload: {
          sourceMemoryId: "test-memory", title: "Canvas", pages: [],
          media: [
            { position: 9, objectKey: "synthetic/top", contentType: "image/jpeg", byteSize: 12 },
            { position: 4, objectKey: "synthetic/background", contentType: "image/jpeg", byteSize: 12 },
            { position: 12, objectKey: "synthetic/photo", contentType: "image/jpeg", byteSize: 12 },
          ],
        },
      });
      const firstResult = await completeGiftPublishSession(db, { sessionId: "first-publication", ownerEmail: "owner@example.test", now: "2026-10-07T00:03:00.000Z" });
      expect(firstResult).not.toBeNull();
      const first = await getSharedAlbumSnapshot(db, firstResult!.albumId);
      expect(first).not.toBeNull();
      const readUrl = (key: string) => `https://read.test/${key}`;
      const photo = readUrl("synthetic/photo");
      const topCover = readUrl("synthetic/top");
      const background = readUrl("synthetic/background");
      const pages: StoryPage[] = [
        { id: "cover", position: 0, kind: "cover", headline: "Canvas", body: "", photoUri: photo, coverImage: topCover,
          layout: { aspectRatio: 0.75, backgroundId: "paper-grid", coverImage: background, coverCrop: { focusX: 0.2, focusY: 0.8, zoom: 1.5 }, elements: [image("first", photo), image("duplicate", photo)] } },
        { id: "second", position: 1, kind: "photo", headline: "Next", body: "", photoUri: photo, coverImage: topCover,
          layout: { aspectRatio: 0.75, coverImage: background, elements: [image("across-pages", photo)] } },
        { id: "photo-only", position: 2, kind: "photo", headline: "Legacy shape", body: "", photoUri: photo },
      ];
      const existing = new Map(first!.media.map((media) => [readUrl(media.objectKey), media]));
      const sources = collectPublicationSources(pages, existing);
      expect(sources.map((source) => source.uri)).toEqual([photo, topCover, background]);
      const references = sources.map((source, position) => ({ ...source, position }));
      const snapshotPages = snapshotPagesForPublication(pages, references);
      expect(JSON.stringify(snapshotPages)).not.toMatch(/(?:file|ph|content|cache|https):/);
      const reused = await resolveExistingGiftMedia(db, "test-gift", 1, references.map((reference) => ({ position: reference.position, mediaId: reference.existingId! })));
      expect(reused?.map((media) => media.objectKey)).toEqual(["synthetic/photo", "synthetic/top", "synthetic/background"]);
      await createGiftPublishSession(db, {
        id: "second-publication", giftId: "test-gift", ownerEmail: "owner@example.test", baseVersion: 1,
        createdAt: "2026-10-07T00:04:00.000Z", expiresAt: "2026-10-07T00:34:00.000Z",
        payload: { sourceMemoryId: "shared:test-gift", title: "Canvas", pages: snapshotPages, media: reused! },
      });
      const secondResult = await completeGiftPublishSession(db, { sessionId: "second-publication", ownerEmail: "owner@example.test", now: "2026-10-07T00:05:00.000Z" });
      expect(secondResult?.version).toBe(2);
      const second = await getSharedAlbumSnapshot(db, secondResult!.albumId);
      expect(second).not.toBeNull();
      const oldIds = new Set(first!.media.map((media) => media.id));
      expect(second!.media.every((media) => !oldIds.has(media.id))).toBe(true);
      expect(second!.media.map((media) => media.position)).toEqual([0, 1, 2]);
      const restored = mapSharedAlbumToStoryPages({
        role: "viewer", title: "Canvas", travelDate: null, pages: second!.pages,
        media: [...second!.media].reverse().map((media) => ({ ...media, readUrl: readUrl(media.objectKey) })),
        version: 2, publishedAt: "2026-10-07T00:05:00.000Z", cover: null,
      });
      expect(restored).toEqual([
        expect.objectContaining({ id: "cover", photoUri: photo, coverImage: topCover, layout: expect.objectContaining({
          backgroundId: "paper-grid", coverImage: background, coverCrop: { focusX: 0.2, focusY: 0.8, zoom: 1.5 },
          elements: [expect.objectContaining(image("first", photo)), expect.objectContaining(image("duplicate", photo))],
        }) }),
        expect.objectContaining({ id: "second", photoUri: photo, coverImage: topCover, layout: expect.objectContaining({ coverImage: background, elements: [expect.objectContaining(image("across-pages", photo))] }) }),
        expect.objectContaining({ id: "photo-only", photoUri: photo }),
      ]);
    } finally {
      await close();
    }
  });
});
