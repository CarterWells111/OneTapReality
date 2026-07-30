import { getServerDatabase } from "../../../server/db/client";
import { createAuthEmailCode, isAuthEmailCodeRateLimited } from "../../../server/auth/repository";
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
    if (!pepper || !apiKey || !from) throw new ApiError(500, "server_configuration_missing", "Server configuration is incomplete");
    requireGiftSharingEnabled();
    const normalizedEmail = normalizeGiftEmail(email);
    requireAlphaEmailAllowed(normalizedEmail);
    const nowDate = new Date();
    const now = nowDate.toISOString();
    let code: Awaited<ReturnType<typeof createGiftEmailCode>>;
    try {
      code = await createGiftEmailCode(normalizedEmail, pepper, undefined, now);
    } catch {
      throw new ApiError(400, "validation_failed", "A valid email address is required");
    }
    const db = getServerDatabase();
    if (await isAuthEmailCodeRateLimited(db, code.email, new Date(nowDate.getTime() - 15 * 60 * 1000).toISOString())) throw new ApiError(429, "email_code_rate_limited", "Please wait before requesting another code");
    await createAuthEmailCode(db, { id: crypto.randomUUID(), email: code.email, codeHash: code.codeHash, createdAt: now, expiresAt: code.expiresAt });
    await sendGiftVerificationEmail({ apiKey, from, email: code.email, code: code.code });
    return Response.json({ email: code.email }, { status: 202 });
  } catch (error) { return errorResponse(error); }
}
