jest.mock("../src/server/db/client", () => ({ getServerDatabase: jest.fn(() => ({})) }));
jest.mock("../src/server/gifts/email-auth", () => ({ createGiftEmailCode: jest.fn(async () => ({ email: "owner@example.com", code: "123456", codeHash: "code-hash", expiresAt: "2026-07-25T00:05:00.000Z" })), normalizeGiftEmail: jest.fn((email: string) => email.trim().toLowerCase()) }));
jest.mock("../src/server/gifts/resend-email-sender", () => ({ sendGiftVerificationEmail: jest.fn(async () => undefined) }));
jest.mock("../src/server/auth/repository", () => ({
  createAuthEmailCode: jest.fn(async () => undefined),
  isAuthEmailCodeRateLimited: jest.fn(async () => false),
  consumeAuthEmailCode: jest.fn(async () => true),
  createOrGetUserByEmail: jest.fn(async () => ({ id: "user-1", email: "owner@example.com", createdAt: "2026-07-25T00:00:00.000Z", lastAuthenticatedAt: "2026-07-25T00:00:00.000Z" })),
  createAuthSession: jest.fn(async () => undefined),
  getAuthenticatedUserByTokenHash: jest.fn(async () => ({ id: "user-1", email: "owner@example.com", createdAt: "2026-07-25T00:00:00.000Z", lastAuthenticatedAt: "2026-07-25T00:00:00.000Z" })),
  revokeAuthSessionByTokenHash: jest.fn(async () => true),
}));
jest.mock("../src/server/auth/device-auth", () => ({ createAccessToken: jest.fn(() => "account-token"), hashAccessToken: jest.fn(async (value: string) => `hash:${value}`), extractBearerToken: jest.fn(() => "account-token") }));

import { GET as getCurrentUser } from "../src/app/api/auth/me+api";
import { POST as logout } from "../src/app/api/auth/logout+api";
import { POST as request } from "../src/app/api/auth/request+api";
import { POST as verify } from "../src/app/api/auth/verify+api";

describe("unified account authentication APIs", () => {
  beforeEach(() => {
    process.env.GIFT_AUTH_PEPPER = "pepper";
    process.env.RESEND_API_KEY = "resend";
    process.env.GIFT_EMAIL_FROM = "support@onetapreality.com";
    process.env.GIFT_ADMIN_EMAILS = "admin@example.com";
  });

  afterEach(() => {
    delete process.env.GIFT_AUTH_PEPPER;
    delete process.env.RESEND_API_KEY;
    delete process.env.GIFT_EMAIL_FROM;
    delete process.env.GIFT_ADMIN_EMAILS;
  });

  it("sends a code without exposing it", async () => {
    const response = await request(new Request("http://localhost/api/auth/request", { method: "POST", body: JSON.stringify({ email: "owner@example.com" }) }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ email: "owner@example.com" });
  });

  it("rejects an invalid email as a client error", async () => {
    const { createGiftEmailCode } = jest.requireMock("../src/server/gifts/email-auth") as { createGiftEmailCode: jest.Mock };
    createGiftEmailCode.mockRejectedValueOnce(new Error("Invalid email address"));
    const response = await request(new Request("http://localhost/api/auth/request", { method: "POST", body: JSON.stringify({ email: "not-an-email" }) }));
    expect(response.status).toBe(400);
  });

  it("creates an account session and returns its server-derived role", async () => {
    const response = await verify(new Request("http://localhost/api/auth/verify", { method: "POST", body: JSON.stringify({ email: "owner@example.com", code: "123456" }) }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ accessToken: "account-token", user: { id: "user-1", email: "owner@example.com", isAdmin: false } });
  });

  it("reports the current user and revokes their session on logout", async () => {
    const me = await getCurrentUser(new Request("http://localhost/api/auth/me", { headers: { Authorization: "Bearer account-token" } }));
    expect(await me.json()).toEqual({ user: { id: "user-1", email: "owner@example.com", isAdmin: false } });
    const response = await logout(new Request("http://localhost/api/auth/logout", { method: "POST", headers: { Authorization: "Bearer account-token" } }));
    expect(response.status).toBe(204);
  });
});
