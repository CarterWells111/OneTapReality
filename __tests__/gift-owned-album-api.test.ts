const mockRequireOwnedGift = jest.fn();
const mockSnapshot = jest.fn();
const mockCreateReadUrl = jest.fn(async (key: string) => `https://read.test/${key}`);
const mockDb = {
  select: jest.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "album-1" }] }) }) })),
};

jest.mock("../src/server/gifts/owner-access", () => ({ requireOwnedGift: (...args: unknown[]) => mockRequireOwnedGift(...args) }));
jest.mock("../src/server/gifts/repository", () => ({ getSharedAlbumSnapshot: (...args: unknown[]) => mockSnapshot(...args) }));
jest.mock("../src/server/gifts/r2-media", () => ({ getR2MediaStoreFromEnvironment: () => ({ createReadUrl: mockCreateReadUrl }) }));

import { GET } from "../src/app/api/my-gifts/[id]/album+api";

describe("owned shared album API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireOwnedGift.mockResolvedValue({ db: mockDb, email: "owner@example.com", gift: { id: "gift-1", status: "bound" } });
    mockSnapshot.mockResolvedValue({
      album: { id: "album-1", title: "Trip", publishedAt: "2026-08-17T00:00:00.000Z", version: 4, coverObjectKey: "cover", coverContentType: "image/jpeg", coverByteSize: 9 },
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
      pages: [{ position: 0, page: { id: "page-1" } }],
      media: [{ id: "media-1", position: 0, contentType: "image/jpeg", byteSize: 12, readUrl: "https://read.test/photo" }],
    }));
  });
});
