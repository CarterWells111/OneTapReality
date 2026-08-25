const reviewAccess = {
  email: "reviewer@example.test",
  fixedCode: "654321",
  fixtureSecret: "B".repeat(43),
  claimToken: "A".repeat(43),
  giftTokenPepper: "gift-token-pepper",
  giftUrlOrigin: "https://staging.onetapreality.com",
};
const mockGetAccess = jest.fn((..._args: unknown[]) => reviewAccess);
const mockResetFixtures = jest.fn(async (..._args: unknown[]) => undefined);
const mockCreateAuthCode = jest.fn(async (..._args: unknown[]) => undefined);
const mockCreateAuthCodeIfAllowed = jest.fn(async (..._args: unknown[]) => "created");
const mockDeleteAuthCode = jest.fn(async (..._args: unknown[]) => undefined);
const mockIsRateLimited = jest.fn(async (..._args: unknown[]) => false);
const mockVerifyCode = jest.fn(async (..._args: unknown[]) => ({
  status: "success",
  user: { id: "review-user", email: "reviewer@example.test", createdAt: "now", lastAuthenticatedAt: "now" },
}));
const mockIsAccountActive = jest.fn(async (..._args: unknown[]) => true);
const mockCreateRandomCode = jest.fn(async (..._args: unknown[]) => { throw new Error("random code must not be generated for review access"); });
const mockSendEmail = jest.fn(async (..._args: unknown[]) => undefined);
const mockHash = jest.fn(async (value: string, ..._args: unknown[]) => `hash:${value}`);
const mockRequireAllowlist = jest.fn((..._args: unknown[]) => undefined);

jest.mock("../src/server/db/client", () => ({ getServerDatabase: jest.fn(() => ({ database: true })) }));
jest.mock("../src/server/auth/apple-review-access", () => ({ getAppleReviewAccess: (...args: unknown[]) => mockGetAccess(...args) }));
jest.mock("../src/server/auth/apple-review-fixtures", () => ({ resetAppleReviewFixtures: (...args: unknown[]) => mockResetFixtures(...args) }));
jest.mock("../src/server/auth/repository", () => ({
  createAuthEmailCode: (...args: unknown[]) => mockCreateAuthCode(...args),
  createAuthEmailCodeIfAllowed: (...args: unknown[]) => mockCreateAuthCodeIfAllowed(...args),
  deleteAuthEmailCodeById: (...args: unknown[]) => mockDeleteAuthCode(...args),
  isAuthEmailCodeRateLimited: (...args: unknown[]) => mockIsRateLimited(...args),
  verifyAccountEmailCode: (...args: unknown[]) => mockVerifyCode(...args),
  isAccountActiveByEmail: (...args: unknown[]) => mockIsAccountActive(...args),
  revokeAuthSessionByTokenHash: jest.fn(async () => true),
}));
jest.mock("../src/server/gifts/email-auth", () => ({
  createGiftEmailCode: (...args: unknown[]) => mockCreateRandomCode(...args),
  normalizeGiftEmail: (email: string) => email.trim().toLowerCase(),
}));
jest.mock("../src/server/gifts/resend-email-sender", () => ({ sendGiftVerificationEmail: (...args: unknown[]) => mockSendEmail(...args) }));
jest.mock("../src/server/auth/device-auth", () => ({
  createAccessToken: jest.fn(() => "review-session-token"),
  hashAccessToken: (value: string, ...args: unknown[]) => mockHash(value, ...args),
}));
jest.mock("../src/server/gifts/alpha-safety", () => ({
  requireAlphaEmailAllowed: (...args: unknown[]) => mockRequireAllowlist(...args),
  requireGiftSharingEnabled: jest.fn(),
}));
jest.mock("../src/server/gifts/admin-auth", () => ({ isGiftAdminEmail: jest.fn(() => false) }));

import { POST as requestCode } from "../src/app/api/auth/request+api";
import { POST as verifyCode } from "../src/app/api/auth/verify+api";

describe("Apple review authentication API branch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GIFT_AUTH_PEPPER = "auth-pepper";
    process.env.RESEND_API_KEY = "resend-key";
    process.env.GIFT_EMAIL_FROM = "support@onetapreality.com";
  });

  afterEach(() => {
    delete process.env.GIFT_AUTH_PEPPER;
    delete process.env.RESEND_API_KEY;
    delete process.env.GIFT_EMAIL_FROM;
  });

  it("stores the fixed code hash with normal rate limiting but sends no email and returns no credential", async () => {
    const response = await requestCode(new Request("http://localhost/api/auth/request", {
      method: "POST",
      body: JSON.stringify({ email: " Reviewer@Example.Test " }),
    }));

    expect(response.status).toBe(202);
    const responseBody = await response.json();
    expect(responseBody).toEqual({ email: "reviewer@example.test" });
    expect(mockCreateAuthCodeIfAllowed).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      email: "reviewer@example.test",
      codeHash: "hash:654321",
      rateLimitSince: expect.any(String),
    }));
    expect(mockIsRateLimited).not.toHaveBeenCalled();
    expect(mockCreateAuthCode).not.toHaveBeenCalled();
    expect(mockCreateRandomCode).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockRequireAllowlist).not.toHaveBeenCalled();
    expect(JSON.stringify(responseBody)).not.toContain("654321");
  });

  it("resets review fixtures only after a successful verified login", async () => {
    const response = await verifyCode(new Request("http://localhost/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ email: "reviewer@example.test", code: "654321" }),
    }));

    expect(response.status).toBe(201);
    expect(mockRequireAllowlist).not.toHaveBeenCalled();
    expect(mockResetFixtures).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "review-user", email: "reviewer@example.test" }),
      reviewAccess,
      expect.any(String),
    );
  });
});
