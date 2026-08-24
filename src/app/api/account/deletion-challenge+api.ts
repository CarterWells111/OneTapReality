import {
  createAccountDeletionChallenge,
  deleteAccountDeletionChallenge,
  isAccountDeletionChallengeRateLimited,
} from "../../../server/auth/account-deletion";
import { requireAuthenticatedAccountSession } from "../../../server/auth/session-auth";
import { getServerDatabase } from "../../../server/db/client";
import { createGiftEmailCode } from "../../../server/gifts/email-auth";
import { sendGiftVerificationEmail } from "../../../server/gifts/resend-email-sender";
import { ApiError, errorResponse } from "../../../server/http/errors";

export async function POST(request: Request): Promise<Response> {
  try {
    const pepper = process.env.GIFT_AUTH_PEPPER;
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.GIFT_EMAIL_FROM;
    if (!pepper || !apiKey || !from) throw new ApiError(500, "server_configuration_missing", "Server configuration is incomplete");
    const db = getServerDatabase();
    const account = await requireAuthenticatedAccountSession(request, db);
    const nowDate = new Date();
    const now = nowDate.toISOString();
    if (await isAccountDeletionChallengeRateLimited(db, account.id, new Date(nowDate.getTime() - 15 * 60_000).toISOString())) {
      throw new ApiError(429, "deletion_challenge_rate_limited", "Please wait before requesting another deletion code", undefined, { "Retry-After": "900" });
    }
    const code = await createGiftEmailCode(account.email, pepper, undefined, now);
    const challengeId = crypto.randomUUID();
    await createAccountDeletionChallenge(db, {
      id: challengeId,
      userId: account.id,
      sessionId: account.sessionId,
      codeHash: code.codeHash,
      createdAt: now,
      expiresAt: code.expiresAt,
    });
    try {
      await sendGiftVerificationEmail({ apiKey, from, email: account.email, code: code.code });
    } catch (error) {
      await deleteAccountDeletionChallenge(db, challengeId);
      throw error;
    }
    return Response.json({ challengeId, expiresAt: code.expiresAt });
  } catch (error) {
    return errorResponse(error);
  }
}
