const mockGetServerDatabase = jest.fn((..._args: unknown[]) => ({ database: true }));
const mockRequireSession = jest.fn(async (..._args: unknown[]) => ({ id: "user-1", email: "owner@example.com", sessionId: "session-1", isAdmin: false }));
const mockCreateCode = jest.fn(async (..._args: unknown[]) => ({ email: "owner@example.com", code: "123456", codeHash: "code-hash", expiresAt: "2026-08-24T10:05:00.000Z" }));
const mockCreateChallenge = jest.fn(async (..._args: unknown[]) => undefined);
const mockCreateChallengeIfAllowed = jest.fn(async (..._args: unknown[]) => "created");
const mockDeleteChallenge = jest.fn(async (..._args: unknown[]) => undefined);
const mockRateLimited = jest.fn(async (..._args: unknown[]) => false);
const mockAcceptDeletion = jest.fn(async (..._args: unknown[]): Promise<{ status: string; receiptId?: string; completeBy?: string }> => ({ status: "accepted", receiptId: "receipt-1", completeBy: "2026-08-25T10:00:00.000Z" }));
const mockSendEmail = jest.fn(async (..._args: unknown[]) => undefined);
const mockHash = jest.fn(async (value: string, ..._args: unknown[]) => `hash:${value}`);

jest.mock("../src/server/db/client", () => ({ getServerDatabase: () => mockGetServerDatabase() }));
jest.mock("../src/server/auth/session-auth", () => ({ requireAuthenticatedAccountSession: (...args: unknown[]) => mockRequireSession(...args) }));
jest.mock("../src/server/gifts/email-auth", () => ({ createGiftEmailCode: (...args: unknown[]) => mockCreateCode(...args) }));
jest.mock("../src/server/gifts/resend-email-sender", () => ({ sendAccountDeletionVerificationEmail: (...args: unknown[]) => mockSendEmail(...args) }));
jest.mock("../src/server/auth/device-auth", () => ({ hashAccessToken: (value: string, ...args: unknown[]) => mockHash(value, ...args) }));
jest.mock("../src/server/auth/account-deletion", () => ({
  createAccountDeletionChallenge: (...args: unknown[]) => mockCreateChallenge(...args),
  createAccountDeletionChallengeIfAllowed: (...args: unknown[]) => mockCreateChallengeIfAllowed(...args),
  deleteAccountDeletionChallenge: (...args: unknown[]) => mockDeleteChallenge(...args),
  isAccountDeletionChallengeRateLimited: (...args: unknown[]) => mockRateLimited(...args),
  acceptAccountDeletion: (...args: unknown[]) => mockAcceptDeletion(...args),
}));

import { DELETE as deleteAccount } from "../src/app/api/account+api";
import { POST as requestChallenge } from "../src/app/api/account/deletion-challenge+api";

describe("account deletion APIs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateChallengeIfAllowed.mockResolvedValue("created");
    process.env.GIFT_AUTH_PEPPER = "pepper";
    process.env.RESEND_API_KEY = "resend";
    process.env.GIFT_EMAIL_FROM = "support@onetapreality.com";
    mockAcceptDeletion.mockResolvedValue({ status: "accepted", receiptId: "receipt-1", completeBy: "2026-08-25T10:00:00.000Z" });
  });

  afterEach(() => {
    delete process.env.GIFT_AUTH_PEPPER;
    delete process.env.RESEND_API_KEY;
    delete process.env.GIFT_EMAIL_FROM;
  });

  it("issues a session-bound challenge without returning or logging the code", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await requestChallenge(new Request("http://localhost/api/account/deletion-challenge", {
      method: "POST", headers: { Authorization: "Bearer session" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ challengeId: expect.any(String), expiresAt: "2026-08-24T10:05:00.000Z" });
    expect(mockCreateChallengeIfAllowed).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      userId: "user-1", sessionId: "session-1", codeHash: "code-hash", rateLimitSince: expect.any(String),
    }));
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ email: "owner@example.com", code: "123456" }));
    expect(JSON.stringify(log.mock.calls)).not.toContain("123456");
  });

  it("removes the persisted challenge if delivery fails and rate limits repeated requests", async () => {
    mockSendEmail.mockRejectedValueOnce(new Error("delivery failed"));
    const failed = await requestChallenge(new Request("http://localhost/api/account/deletion-challenge", { method: "POST" }));
    expect(failed.status).toBe(500);
    expect(mockDeleteChallenge).toHaveBeenCalledWith(expect.anything(), expect.any(String));

    mockCreateChallengeIfAllowed.mockResolvedValueOnce("rate_limited");
    const limited = await requestChallenge(new Request("http://localhost/api/account/deletion-challenge", { method: "POST" }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("900");
  });

  it("requires the exact confirmation and maps challenge failures to stable errors", async () => {
    const invalidConfirmation = await deleteAccount(new Request("http://localhost/api/account", {
      method: "DELETE", body: JSON.stringify({ challengeId: "challenge-1", code: "123456", confirmation: "delete" }),
    }));
    expect(invalidConfirmation.status).toBe(400);
    expect(mockAcceptDeletion).not.toHaveBeenCalled();

    mockAcceptDeletion.mockResolvedValueOnce({ status: "invalid_code" });
    const wrongCode = await deleteAccount(new Request("http://localhost/api/account", {
      method: "DELETE", body: JSON.stringify({ challengeId: "challenge-1", code: "000000", confirmation: "DELETE" }),
    }));
    expect(wrongCode.status).toBe(401);
    await expect(wrongCode.json()).resolves.toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "invalid_deletion_code" }) }));

    mockAcceptDeletion.mockResolvedValueOnce({ status: "challenge_expired" });
    const expired = await deleteAccount(new Request("http://localhost/api/account", {
      method: "DELETE", body: JSON.stringify({ challengeId: "challenge-1", code: "123456", confirmation: "DELETE" }),
    }));
    expect(expired.status).toBe(410);
  });

  it("returns a 202 receipt with a 24-hour completion deadline", async () => {
    const response = await deleteAccount(new Request("http://localhost/api/account", {
      method: "DELETE", headers: { Authorization: "Bearer session", "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId: "challenge-1", code: "123456", confirmation: "DELETE" }),
    }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ receiptId: "receipt-1", completeBy: "2026-08-25T10:00:00.000Z" });
    expect(mockAcceptDeletion).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      challengeId: "challenge-1", userId: "user-1", sessionId: "session-1", codeHash: "hash:123456", confirmation: "DELETE",
    }));
  });
});
