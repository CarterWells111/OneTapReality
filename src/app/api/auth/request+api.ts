import { getServerDatabase } from "../../../server/db/client";
import { getAppleReviewAccess } from "../../../server/auth/apple-review-access";
import { hashAccessToken } from "../../../server/auth/device-auth";
import { createAuthEmailCodeIfAllowed, deleteAuthEmailCodeById, isAccountActiveByEmail } from "../../../server/auth/repository";
import { createGiftEmailCode, normalizeGiftEmail } from "../../../server/gifts/email-auth";
import { sendGiftVerificationEmail } from "../../../server/gifts/resend-email-sender";
import { ApiError, errorResponse } from "../../../server/http/errors";
import { requireAlphaEmailAllowed, requireGiftSharingEnabled } from "../../../server/gifts/alpha-safety";

export async function POST(request: Request): Promise<Response> {
  try {
    const { email } = await request.json() as { email?: string };
    const pepper = process.env.GIFT_AUTH_PEPPER;
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.GIFT_EMAIL_FROM;
    if (typeof email !== "string") throw new ApiError(400, "validation_failed", "Email is required");
    if (!pepper) throw new ApiError(500, "server_configuration_missing", "Server configuration is incomplete");
    requireGiftSharingEnabled();
    let normalizedEmail: string;
    try {
      normalizedEmail = normalizeGiftEmail(email);
    } catch {
      throw new ApiError(400, "validation_failed", "A valid email address is required");
    }
    const reviewAccess = getAppleReviewAccess(normalizedEmail);
    if (!reviewAccess) requireAlphaEmailAllowed(normalizedEmail);
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const code = reviewAccess
      ? {
          email: normalizedEmail,
          code: reviewAccess.fixedCode,
          codeHash: await hashAccessToken(reviewAccess.fixedCode, pepper),
          expiresAt: new Date(nowDate.getTime() + 5 * 60_000).toISOString(),
        }
      : await createGiftEmailCode(normalizedEmail, pepper, undefined, now);
    const db = getServerDatabase();
    if (!await isAccountActiveByEmail(db, code.email)) throw new ApiError(403, "account_deletion_pending", "This account is being permanently deleted");
    const codeId = crypto.randomUUID();
    const issueStatus = await createAuthEmailCodeIfAllowed(db, {
      id: codeId,
      email: code.email,
      codeHash: code.codeHash,
      createdAt: now,
      expiresAt: code.expiresAt,
      rateLimitSince: new Date(nowDate.getTime() - 15 * 60 * 1000).toISOString(),
    });
    if (issueStatus === "rate_limited") throw new ApiError(429, "email_code_rate_limited", "Please wait before requesting another code");
    if (!reviewAccess) {
      if (!apiKey || !from) {
        await deleteAuthEmailCodeById(db, codeId);
        throw new ApiError(500, "server_configuration_missing", "Server configuration is incomplete");
      }
      try {
        await sendGiftVerificationEmail({ apiKey, from, email: code.email, code: code.code });
      } catch (error) {
        await deleteAuthEmailCodeById(db, codeId);
        throw error;
      }
    }
    return Response.json({ email: code.email }, { status: 202 });
  } catch (error) { return errorResponse(error); }
}
