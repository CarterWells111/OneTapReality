jest.mock("../src/server/db/client", () => ({ getServerDatabase: jest.fn(() => ({})) }));
jest.mock("../src/server/auth/device-auth", () => ({ hashAccessToken: jest.fn(async (value: string) => `hash:${value}`), extractBearerToken: jest.fn(() => "session") }));
jest.mock("../src/server/auth/repository", () => ({ getAuthenticatedUserByTokenHash: jest.fn(async () => ({ id: "user-1", email: "viewer@example.com" })) }));
jest.mock("../src/server/gifts/repository", () => ({ getGiftAccessByTokenHash: jest.fn(async () => ({ id: "gift-1", status: "bound", role: "viewer", albumId: "album-1", albumTitle: "A shared trip", publishedAt: "2026-07-24T00:00:00.000Z", version: 1 })) }));

import { GET } from "../src/app/api/gifts/[token]/access+api";

describe("gift access API", () => {
  it("returns album state only to an authorized verified email", async () => {
    process.env.GIFT_AUTH_PEPPER = "auth";
    process.env.GIFT_TOKEN_PEPPER = "gift";
    const response = await GET(new Request("http://localhost/api/gifts/tag/access", { headers: { Authorization: "Bearer session" } }), { token: "tag" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ role: "viewer", albumId: "album-1" }));
  });
});
