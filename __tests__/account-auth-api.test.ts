jest.mock("../src/server/db/client", () => ({ getServerDatabase: jest.fn(() => ({})) }));
jest.mock("../src/server/gifts/email-auth", () => {
  const actual = jest.requireActual("../src/server/gifts/email-auth") as typeof import("../src/server/gifts/email-auth");
  return {
    createGiftEmailCode: jest.fn(async () => ({ email: "owner@example.com", code: "123456", codeHash: "code-hash", expiresAt: "2026-07-25T00:05:00.000Z" })),
    normalizeGiftEmail: actual.normalizeGiftEmail,
  };
});
jest.mock("../src/server/gifts/resend-email-sender", () => ({ sendGiftVerificationEmail: jest.fn(async () => undefined) }));
jest.mock("../src/server/auth/repository", () => ({
  createAuthEmailCode: jest.fn(async () => undefined),
  createAuthEmailCodeIfAllowed: jest.fn(async () => "created"),
  deleteAuthEmailCodeById: jest.fn(async () => true),
  isAuthEmailCodeRateLimited: jest.fn(async () => false),
  isAccountActiveByEmail: jest.fn(async () => true),
  verifyAccountEmailCode: jest.fn(async () => ({ status: "success", user: { id: "user-1", email: "owner@example.com", createdAt: "2026-07-25T00:00:00.000Z", lastAuthenticatedAt: "2026-07-25T00:00:00.000Z" } })),
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
    jest.clearAllMocks();
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
    delete process.env.ALPHA_ALLOWED_EMAILS;
  });

  it("sends a code without exposing it", async () => {
    const { hashAccessToken } = jest.requireMock("../src/server/auth/device-auth") as { hashAccessToken: jest.Mock };
    hashAccessToken.mockResolvedValueOnce("opaque-issue-scope");
    const response = await request(new Request("http://localhost/api/auth/request", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.8, 10.0.0.1" },
      body: JSON.stringify({ email: "owner@example.com" }),
    }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ email: "owner@example.com" });
    const { createAuthEmailCodeIfAllowed } = jest.requireMock("../src/server/auth/repository") as { createAuthEmailCodeIfAllowed: jest.Mock };
    expect(hashAccessToken).toHaveBeenCalledWith(expect.stringMatching(/^issue-ip:203\.0\.113\.8:\d+$/u), "pepper");
    expect(createAuthEmailCodeIfAllowed).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      email: "owner@example.com",
      rateLimitSince: expect.any(String),
      issueScopeHash: "opaque-issue-scope",
      issueWindowStartedAt: expect.any(String),
      issueExpiresAt: expect.any(String),
    }));
    expect(JSON.stringify(createAuthEmailCodeIfAllowed.mock.calls[0]?.[1])).not.toContain("203.0.113.8");
  });

  it("returns 429 when the atomic login-code issue reaches its window limit", async () => {
    const { createAuthEmailCodeIfAllowed } = jest.requireMock("../src/server/auth/repository") as { createAuthEmailCodeIfAllowed: jest.Mock };
    createAuthEmailCodeIfAllowed.mockResolvedValueOnce("rate_limited");

    const response = await request(new Request("http://localhost/api/auth/request", {
      method: "POST", body: JSON.stringify({ email: "owner@example.com" }),
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      error: expect.objectContaining({ code: "email_code_rate_limited" }),
    }));
    const { sendGiftVerificationEmail } = jest.requireMock("../src/server/gifts/resend-email-sender") as { sendGiftVerificationEmail: jest.Mock };
    expect(sendGiftVerificationEmail).not.toHaveBeenCalled();
  });

  it("removes an issued code when email delivery fails", async () => {
    const { sendGiftVerificationEmail } = jest.requireMock("../src/server/gifts/resend-email-sender") as { sendGiftVerificationEmail: jest.Mock };
    const { deleteAuthEmailCodeById } = jest.requireMock("../src/server/auth/repository") as { deleteAuthEmailCodeById: jest.Mock };
    sendGiftVerificationEmail.mockRejectedValueOnce(new Error("delivery failed"));

    const response = await request(new Request("http://localhost/api/auth/request", { method: "POST", body: JSON.stringify({ email: "owner@example.com" }) }));

    expect(response.status).toBe(500);
    expect(deleteAuthEmailCodeById).toHaveBeenCalledWith(expect.anything(), expect.any(String), expect.stringMatching(/^hash:issue-ip:/u));
  });

  it("rejects an invalid email as a client error", async () => {
    const response = await request(new Request("http://localhost/api/auth/request", { method: "POST", body: JSON.stringify({ email: "not-an-email" }) }));
    expect(response.status).toBe(400);
  });

  it("does not send a code to an email outside the staging Alpha allowlist", async () => {
    process.env.ALPHA_ALLOWED_EMAILS = "owner@example.com";

    const response = await request(new Request("http://localhost/api/auth/request", { method: "POST", body: JSON.stringify({ email: "outside@example.com" }) }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "beta_invite_required" }) }));
    const { sendGiftVerificationEmail } = jest.requireMock("../src/server/gifts/resend-email-sender") as { sendGiftVerificationEmail: jest.Mock };
    expect(sendGiftVerificationEmail).not.toHaveBeenCalled();
  });

  it("does not issue a new login code while permanent deletion is pending", async () => {
    const { isAccountActiveByEmail } = jest.requireMock("../src/server/auth/repository") as { isAccountActiveByEmail: jest.Mock };
    isAccountActiveByEmail.mockResolvedValueOnce(false);

    const response = await request(new Request("http://localhost/api/auth/request", { method: "POST", body: JSON.stringify({ email: "owner@example.com" }) }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "account_deletion_pending" }) }));
    const { sendGiftVerificationEmail } = jest.requireMock("../src/server/gifts/resend-email-sender") as { sendGiftVerificationEmail: jest.Mock };
    expect(sendGiftVerificationEmail).not.toHaveBeenCalled();
  });

  it("creates an account session and returns its server-derived role", async () => {
    const response = await verify(new Request("http://localhost/api/auth/verify", { method: "POST", body: JSON.stringify({ email: "owner@example.com", code: "123456" }) }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ accessToken: "account-token", user: { id: "user-1", email: "owner@example.com", isAdmin: false } });
  });

  it("returns retry guidance when the verification IP window is exhausted", async () => {
    const { verifyAccountEmailCode } = jest.requireMock("../src/server/auth/repository") as { verifyAccountEmailCode: jest.Mock };
    verifyAccountEmailCode.mockResolvedValueOnce({ status: "rate_limited" });

    const response = await verify(new Request("http://localhost/api/auth/verify", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.5" },
      body: JSON.stringify({ email: "owner@example.com", code: "123456" }),
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
  });

  it("reports the current user and revokes their session on logout", async () => {
    const me = await getCurrentUser(new Request("http://localhost/api/auth/me", { headers: { Authorization: "Bearer account-token" } }));
    expect(await me.json()).toEqual({ user: { id: "user-1", email: "owner@example.com", isAdmin: false } });
    const response = await logout(new Request("http://localhost/api/auth/logout", { method: "POST", headers: { Authorization: "Bearer account-token" } }));
    expect(response.status).toBe(204);
  });
});
