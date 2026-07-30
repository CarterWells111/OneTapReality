jest.mock("../src/server/auth/device-auth", () => ({ extractBearerToken: jest.fn(() => "session-token"), hashAccessToken: jest.fn(async () => "token-hash") }));
jest.mock("../src/server/auth/repository", () => ({ getAuthenticatedUserByTokenHash: jest.fn(async () => ({ id: "user-1", email: "owner@example.com", createdAt: "now", lastAuthenticatedAt: "now" })) }));

import { requireGiftSessionEmail } from "../src/server/gifts/session-auth";

describe("gift authorization uses the unified account session", () => {
  it("returns the canonical account email", async () => {
    process.env.GIFT_AUTH_PEPPER = "pepper";
    await expect(requireGiftSessionEmail(new Request("http://localhost", { headers: { Authorization: "Bearer session-token" } }), {} as never)).resolves.toBe("owner@example.com");
  });

  it("rejects a verified account outside the configured Alpha allowlist", async () => {
    process.env.GIFT_AUTH_PEPPER = "pepper";
    process.env.ALPHA_ALLOWED_EMAILS = "viewer@example.com";

    await expect(requireGiftSessionEmail(new Request("http://localhost", { headers: { Authorization: "Bearer session-token" } }), {} as never)).rejects.toMatchObject({
      status: 403,
      code: "beta_invite_required",
    });

    delete process.env.ALPHA_ALLOWED_EMAILS;
  });
});
