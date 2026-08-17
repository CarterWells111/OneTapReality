jest.mock("../src/server/db/client", () => ({ getServerDatabase: jest.fn(() => ({})) }));
jest.mock("../src/server/auth/session-auth", () => ({ requireAuthenticatedAccount: jest.fn(async () => ({ id: "viewer-user", email: "viewer@example.com", isAdmin: false })) }));
jest.mock("../src/server/gifts/session-auth", () => ({ hashGiftToken: jest.fn(async (token: string) => `hash:${token}`) }));
jest.mock("../src/server/gifts/repository", () => ({
  activateGiftViewerByTokenHash: jest.fn(async () => ({ giftId: "gift-1", role: "viewer", albumPublished: true })),
}));

import { POST } from "../src/app/api/gifts/[token]/activate-viewer+api";
import { activateGiftViewerByTokenHash } from "../src/server/gifts/repository";

describe("viewer gift activation API", () => {
  afterEach(() => { delete process.env.GIFT_SHARING_ENABLED; });

  it("activates an eligible viewer only through the gift token route", async () => {
    const response = await POST(new Request("http://localhost/api/gifts/token/activate-viewer", { method: "POST", headers: { Authorization: "Bearer session" } }), { token: "gift-token" });
    expect(response.status).toBe(200);
    expect(activateGiftViewerByTokenHash).toHaveBeenCalledWith(expect.anything(), "hash:gift-token", expect.objectContaining({ id: "viewer-user", email: "viewer@example.com" }), expect.any(String));
    await expect(response.json()).resolves.toEqual({ giftId: "gift-1", role: "viewer", albumPublished: true });
  });

  it("honours the gift-sharing stop switch", async () => {
    process.env.GIFT_SHARING_ENABLED = "false";
    const response = await POST(new Request("http://localhost/api/gifts/token/activate-viewer", { method: "POST" }), { token: "gift-token" });
    expect(response.status).toBe(503);
  });
});
