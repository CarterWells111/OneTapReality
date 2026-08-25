import {
  createAccountDeletionChallengeIfAllowed,
  deleteAccountDeletionChallenge,
} from "../../../server/auth/account-deletion";
import { getAppleReviewAccess } from "../../../server/auth/apple-review-access";
import { hashAccessToken } from "../../../server/auth/device-auth";
import { requireAuthenticatedAccountSession } from "../../../server/auth/session-auth";
import { getServerDatabase } from "../../../server/db/client";
import { createGiftEmailCode } from "../../../server/gifts/email-auth";
import { sendAccountDeletionVerificationEmail } from "../../../server/gifts/resend-email-sender";
import { ApiError, errorResponse } from "../../../server/http/errors";

export async function POST(request: Request): Promise<Response> {
  try {
    const pepper = process.env.GIFT_AUTH_PEPPER;
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.GIFT_EMAIL_FROM;
    if (!pepper) throw new ApiError(500, "server_configuration_missing", "Server configuration is incomplete");
    const db = getServerDatabase();
    const account = await requireAuthenticatedAccountSession(request, db);
    const reviewAccess = getAppleReviewAccess(account.email);
    if (!reviewAccess && (!apiKey || !from)) throw new ApiError(500, "server_configuration_missing", "Server configuration is incomplete");
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const code = reviewAccess
      ? {
          code: reviewAccess.fixedCode,
          codeHash: await hashAccessToken(reviewAccess.fixedCode, pepper),
          expiresAt: new Date(nowDate.getTime() + 5 * 60_000).toISOString(),
        }
      : await createGiftEmailCode(account.email, pepper, undefined, now);
    const challengeId = crypto.randomUUID();
    const issueStatus = await createAccountDeletionChallengeIfAllowed(db, {
      id: challengeId,
      userId: account.id,
      sessionId: account.sessionId,
      codeHash: code.codeHash,
      createdAt: now,
      expiresAt: code.expiresAt,
      rateLimitSince: new Date(nowDate.getTime() - 15 * 60_000).toISOString(),
    });
    if (issueStatus === "rate_limited") {
      throw new ApiError(429, "deletion_challenge_rate_limited", "Please wait before requesting another deletion code", undefined, { "Retry-After": "900" });
    }
    if (!reviewAccess) {
      try {
        await sendAccountDeletionVerificationEmail({ apiKey: apiKey!, from: from!, email: account.email, code: code.code });
      } catch (error) {
        await deleteAccountDeletionChallenge(db, challengeId);
        throw error;
      }
    }
    return Response.json({ challengeId, expiresAt: code.expiresAt });
  } catch (error) {
    return errorResponse(error);
  }
}
