jest.mock("../src/server/gifts/email-auth", () => ({ normalizeGiftEmail: jest.fn((email: string) => email.trim().toLowerCase()) }));
jest.mock("../src/server/auth/repository", () => ({
  verifyAccountEmailCode: jest.fn(async () => ({ status: "success", user: { id: "user-1", email: "owner@example.com" } })),
}));
jest.mock("../src/server/auth/device-auth", () => ({ createAccessToken: jest.fn(() => "session-token"), hashAccessToken: jest.fn(async () => "session-hash") }));
jest.mock("../src/server/db/client", () => ({ getServerDatabase: jest.fn(() => ({})) }));

import { POST } from "../src/app/api/gift-auth/verify+api";

describe("gift email verification API", () => {
  it("creates a 30 day session after consuming a valid code", async () => {
    process.env.GIFT_AUTH_PEPPER = "pepper";
    const response = await POST(new Request("http://localhost/api/gift-auth/verify", { method: "POST", body: JSON.stringify({ email: "owner@example.com", code: "123456" }) }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ accessToken: "session-token", user: { id: "user-1", email: "owner@example.com", isAdmin: false } });
    delete process.env.GIFT_AUTH_PEPPER;
  });
});
