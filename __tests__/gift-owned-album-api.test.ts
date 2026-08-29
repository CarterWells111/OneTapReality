const mockRequireOwnedGift = jest.fn();
const mockSnapshot = jest.fn();
const mockCreateReadUrl = jest.fn(async (key: string) => `https://read.test/${key}`);
const mockListOwnedGifts = jest.fn(async () => [
  { id: "gift-1", status: "bound", claimedAt: "2026-08-17T00:00:00.000Z", albumId: "album-1", albumTitle: "Trip", travelDate: "2026-08-17", publishedAt: "2026-08-17T00:00:00.000Z", version: 4, coverObjectKey: null, coverContentType: null, coverByteSize: null },
]);
const mockDb = {
  select: jest.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "album-1" }] }) }) })),
};

jest.mock("../src/server/gifts/owner-access", () => ({ requireOwnedGift: (...args: unknown[]) => mockRequireOwnedGift(...args) }));
jest.mock("../src/server/db/client", () => ({ getServerDatabase: () => mockDb }));
jest.mock("../src/server/gifts/session-auth", () => ({ requireGiftSessionEmail: jest.fn(async () => "owner@example.com") }));
jest.mock("../src/server/gifts/repository", () => ({
  getSharedAlbumSnapshot: (...args: unknown[]) => mockSnapshot(...args),
  listGiftMembers: jest.fn(async () => []),
  listOwnedGifts: () => mockListOwnedGifts(),
}));
jest.mock("../src/server/gifts/r2-media", () => ({ getR2MediaStoreFromEnvironment: () => ({ createReadUrl: mockCreateReadUrl }) }));

import { GET } from "../src/app/api/my-gifts/[id]/album+api";
import { GET as getManagement } from "../src/app/api/my-gifts/[id]/manage+api";
import { GET as listOwned } from "../src/app/api/gifts/owned+api";

describe("owned shared album API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireOwnedGift.mockResolvedValue({ db: mockDb, email: "owner@example.com", gift: { id: "gift-1", status: "bound" } });
    mockSnapshot.mockResolvedValue({
      album: { id: "album-1", title: "Trip", sourceMemoryId: "memory-1", travelDate: "2026-08-17", publishedAt: "2026-08-17T00:00:00.000Z", version: 4, coverObjectKey: "cover", coverContentType: "image/jpeg", coverByteSize: 9 },
      pages: [{ position: 0, page: { id: "page-1" } }],
      media: [{ id: "media-1", position: 0, objectKey: "photo", contentType: "image/jpeg", byteSize: 12 }],
    });
  });

  it("returns the complete current snapshot to the verified owner without object keys", async () => {
    const response = await GET(new Request("https://test/api/my-gifts/gift-1/album", { headers: { Authorization: "Bearer token" } }), { id: "gift-1" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      role: "owner",
      title: "Trip",
      travelDate: "2026-08-17",
      pages: [{ position: 0, page: { id: "page-1" } }],
      media: [{ id: "media-1", position: 0, contentType: "image/jpeg", byteSize: 12, readUrl: "https://read.test/photo" }],
    }));
  });

  it("returns null for a legacy owner album without a travel date", async () => {
    mockSnapshot.mockResolvedValueOnce({
      album: { id: "album-1", title: "Legacy", sourceMemoryId: "memory-1", travelDate: null, publishedAt: "2026-08-17T00:00:00.000Z", version: 1, coverObjectKey: null },
      pages: [],
      media: [],
    });
    const response = await GET(new Request("https://test/api/my-gifts/gift-1/album"), { id: "gift-1" });
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ title: "Legacy", travelDate: null }));
  });

  it("exposes travel dates in owner management and owned gift lists", async () => {
    const management = await getManagement(new Request("https://test/api/my-gifts/gift-1/manage"), { id: "gift-1" });
    await expect(management.json()).resolves.toEqual(expect.objectContaining({ album: expect.objectContaining({ title: "Trip", travelDate: "2026-08-17" }) }));

    const owned = await listOwned(new Request("https://test/api/gifts/owned"));
    await expect(owned.json()).resolves.toEqual({ items: [expect.objectContaining({ album: expect.objectContaining({ title: "Trip", travelDate: "2026-08-17" }) })] });
  });
});
