jest.mock("../src/server/db/client", () => ({ getServerDatabase: jest.fn(() => ({})) }));
jest.mock("../src/server/gifts/session-auth", () => ({ requireGiftSessionEmail: jest.fn(async () => "viewer@example.com") }));
jest.mock("../src/server/auth/session-auth", () => ({ requireAuthenticatedAccount: jest.fn(async () => ({ id: "viewer-user", email: "viewer@example.com", isAdmin: false })) }));
jest.mock("../src/server/gifts/r2-media", () => ({
  getR2MediaStoreFromEnvironment: jest.fn(() => ({
    createReadUrl: jest.fn(async (key: string) => `https://cdn.example.test/${key}`),
  })),
}));
jest.mock("../src/server/gifts/repository", () => ({
  listInvitedGifts: jest.fn(async () => [
    { giftId: "gift-1", role: "viewer", albumId: "album-1", albumTitle: "A shared trip", publishedAt: "2026-07-24T00:00:00.000Z", version: 1, coverObjectKey: "gifts/gift-1/cover.jpg", coverContentType: "image/jpeg", coverByteSize: 24 },
    { giftId: "gift-2", role: "viewer", albumId: null, albumTitle: null, publishedAt: null, version: null, coverObjectKey: null, coverContentType: null, coverByteSize: null },
  ]),
  getActivatedGiftAccessByGiftId: jest.fn(async (_db: unknown, giftId: string) =>
    giftId === "gift-1"
      ? { id: "gift-1", status: "bound", role: "viewer", albumId: "album-1", albumTitle: "A shared trip", publishedAt: "2026-07-24T00:00:00.000Z", version: 1, coverObjectKey: "gifts/gift-1/cover.jpg", coverContentType: "image/jpeg", coverByteSize: 24 }
      : null,
  ),
  getSharedAlbumSnapshot: jest.fn(async () => ({
    album: { id: "album-1", title: "A shared trip", publishedAt: "2026-07-24T00:00:00.000Z", version: 1, coverObjectKey: "gifts/gift-1/cover.jpg", coverContentType: "image/jpeg", coverByteSize: 24 },
    pages: [{ position: 0, page: { kind: "cover" } }],
    media: [],
  })),
}));

import { GET as listInvited } from "../src/app/api/gifts/invited+api";
import { GET as readInvitedAlbum } from "../src/app/api/gifts/invited/[id]/album+api";
import { getActivatedGiftAccessByGiftId } from "../src/server/gifts/repository";

function authedRequest(path: string) {
  return new Request(`http://localhost${path}`, { headers: { Authorization: "Bearer session" } });
}

describe("invited gift APIs", () => {
  it("lists only the current viewer's published albums with signed covers", async () => {
    const response = await listInvited(authedRequest("/api/gifts/invited"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [
        expect.objectContaining({
          giftId: "gift-1",
          album: expect.objectContaining({
            title: "A shared trip",
            cover: expect.objectContaining({ readUrl: "https://cdn.example.test/gifts/gift-1/cover.jpg", contentType: "image/jpeg", byteSize: 24 }),
          }),
        }),
        expect.objectContaining({ giftId: "gift-2", album: null }),
      ],
    });
  });

  it("pauses while gift sharing is disabled", async () => {
    process.env.GIFT_SHARING_ENABLED = "false";
    const response = await listInvited(authedRequest("/api/gifts/invited"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "gift_sharing_paused" }) }));
    delete process.env.GIFT_SHARING_ENABLED;
  });

  it("returns a published album only to its viewer", async () => {
    const response = await readInvitedAlbum(authedRequest("/api/gifts/invited/gift-1/album"), { id: "gift-1" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      title: "A shared trip",
      cover: expect.objectContaining({ readUrl: "https://cdn.example.test/gifts/gift-1/cover.jpg" }),
    }));
  });

  it("rejects non-viewers and missing albums", async () => {
    (getActivatedGiftAccessByGiftId as jest.Mock).mockResolvedValueOnce(null);
    const denied = await readInvitedAlbum(authedRequest("/api/gifts/invited/gift-9/album"), { id: "gift-9" });
    expect(denied.status).toBe(403);

    (getActivatedGiftAccessByGiftId as jest.Mock).mockResolvedValueOnce({ id: "gift-2", status: "bound", role: "viewer", albumId: null, albumTitle: null, publishedAt: null, version: null, coverObjectKey: null, coverContentType: null, coverByteSize: null });
    const missing = await readInvitedAlbum(authedRequest("/api/gifts/invited/gift-2/album"), { id: "gift-2" });
    expect(missing.status).toBe(404);
  });
});
