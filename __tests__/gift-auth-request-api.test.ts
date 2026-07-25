jest.mock("../src/server/gifts/email-auth", () => ({ createGiftEmailCode: jest.fn(async () => ({ email: "owner@example.com", code: "123456", codeHash: "code-hash", expiresAt: "2026-07-24T00:05:00.000Z" })) }));
jest.mock("../src/server/auth/repository", () => ({ createAuthEmailCode: jest.fn(async () => undefined), isAuthEmailCodeRateLimited: jest.fn(async () => false) }));
jest.mock("../src/server/gifts/resend-email-sender", () => ({ sendGiftVerificationEmail: jest.fn(async () => undefined) }));
jest.mock("../src/server/db/client", () => ({ getServerDatabase: jest.fn(() => ({})) }));

import { POST } from "../src/app/api/gift-auth/request+api";

describe("gift email request API", () => {
  it("accepts an email without returning its verification code", async () => {
    process.env.GIFT_AUTH_PEPPER = "pepper";
    process.env.RESEND_API_KEY = "resend";
    process.env.GIFT_EMAIL_FROM = "support@onetapreality.com";
    const response = await POST(new Request("http://localhost/api/gift-auth/request", { method: "POST", body: JSON.stringify({ email: "owner@example.com" }) }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ email: "owner@example.com" });
  });
});
