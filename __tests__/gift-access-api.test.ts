jest.mock("../src/server/db/client", () => ({ getServerDatabase: jest.fn(() => ({})) }));
jest.mock("../src/server/auth/device-auth", () => ({ hashAccessToken: jest.fn(async (value: string) => `hash:${value}`), extractBearerToken: jest.fn(() => "session") }));
jest.mock("../src/server/auth/repository", () => ({ getAuthenticatedUserByTokenHash: jest.fn(async () => ({ id: "user-1", email: "viewer@example.com" })) }));
jest.mock("../src/server/auth/session-auth", () => ({ requireAuthenticatedAccount: jest.fn(async () => ({ id: "user-1", email: "viewer@example.com" })) }));
jest.mock("../src/server/gifts/session-auth", () => ({ hashGiftToken: jest.fn(async (value: string) => `hash:${value}`), requireGiftSessionEmail: jest.fn(async () => "viewer@example.com") }));
jest.mock("../src/server/gifts/r2-media", () => ({ getR2MediaStoreFromEnvironment: jest.fn(() => ({ createReadUrl: jest.fn(async (key: string) => `https://cdn.test/${key}`) })) }));
jest.mock("../src/server/gifts/repository", () => ({
  getGiftAccessByTokenHash: jest.fn(async () => ({ id: "gift-1", status: "bound", role: "viewer", albumId: "album-1", albumTitle: "A shared trip", travelDate: "2026-07-24", publishedAt: "2026-07-24T00:00:00.000Z", version: 1 })),
  getActivatedGiftAccessByGiftId: jest.fn(async () => ({ id: "gift-1", role: "viewer" })),
  getSharedAlbumSnapshot: jest.fn(async () => ({
    album: { id: "album-1", title: "A shared trip", travelDate: "2026-07-24", publishedAt: "2026-07-24T00:00:00.000Z", version: 1, coverObjectKey: null },
    pages: [],
    media: [],
  })),
}));

import { GET } from "../src/app/api/gifts/[token]/access+api";
import { GET as getAlbum } from "../src/app/api/gifts/[token]/album+api";
import { getGiftAccessByTokenHash, getSharedAlbumSnapshot } from "../src/server/gifts/repository";

describe("gift access API", () => {
  it("returns album state only to an authorized verified email", async () => {
    process.env.GIFT_AUTH_PEPPER = "auth";
    process.env.GIFT_TOKEN_PEPPER = "gift";
    const response = await GET(new Request("http://localhost/api/gifts/tag/access", { headers: { Authorization: "Bearer session" } }), { token: "tag" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ role: "viewer", albumId: "album-1", travelDate: "2026-07-24" }));
  });

  it("returns the token album travel date without object keys", async () => {
    const response = await getAlbum(new Request("http://localhost/api/gifts/tag/album", { headers: { Authorization: "Bearer session" } }), { token: "tag" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ title: "A shared trip", travelDate: "2026-07-24", media: [] }));
  });

  it("returns null from access and album responses for legacy shared albums", async () => {
    (getGiftAccessByTokenHash as jest.Mock).mockResolvedValueOnce({ id: "gift-1", status: "bound", role: "viewer", albumId: "album-1", albumTitle: "Legacy", travelDate: null, publishedAt: "2026-07-24T00:00:00.000Z", version: 1 });
    const access = await GET(new Request("http://localhost/api/gifts/tag/access", { headers: { Authorization: "Bearer session" } }), { token: "tag" });
    await expect(access.json()).resolves.toEqual(expect.objectContaining({ albumTitle: "Legacy", travelDate: null }));

    (getSharedAlbumSnapshot as jest.Mock).mockResolvedValueOnce({ album: { id: "album-1", title: "Legacy", travelDate: null, publishedAt: "2026-07-24T00:00:00.000Z", version: 1, coverObjectKey: null }, pages: [], media: [] });
    const album = await getAlbum(new Request("http://localhost/api/gifts/tag/album", { headers: { Authorization: "Bearer session" } }), { token: "tag" });
    await expect(album.json()).resolves.toEqual(expect.objectContaining({ title: "Legacy", travelDate: null }));
  });
});
