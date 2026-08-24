import { createAccessToken, hashAccessToken } from "../../../server/auth/device-auth";
import { verifyAccountEmailCode } from "../../../server/auth/repository";
import { isGiftAdminEmail } from "../../../server/gifts/admin-auth";
import { getServerDatabase } from "../../../server/db/client";
import { normalizeGiftEmail } from "../../../server/gifts/email-auth";
import { ApiError, errorResponse } from "../../../server/http/errors";
import { requireAlphaEmailAllowed, requireGiftSharingEnabled } from "../../../server/gifts/alpha-safety";

export async function POST(request: Request): Promise<Response> {
  try {
    const { email: rawEmail, code } = await request.json() as { email?: string; code?: string };
    if (typeof rawEmail !== "string" || typeof code !== "string" || !/^\d{6}$/u.test(code)) throw new ApiError(400, "validation_failed", "Email and six digit code are required");
    const authPepper = process.env.GIFT_AUTH_PEPPER;
    if (!authPepper) throw new ApiError(500, "server_configuration_missing", "Server configuration is incomplete");
    const email = normalizeGiftEmail(rawEmail);
    requireGiftSharingEnabled();
    requireAlphaEmailAllowed(email);
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const db = getServerDatabase();
    const accessToken = createAccessToken();
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() || "unknown";
    const windowStartedMs = Math.floor(nowDate.getTime() / (15 * 60 * 1000)) * 15 * 60 * 1000;
    const result = await verifyAccountEmailCode(db, {
      email,
      codeHash: await hashAccessToken(code, authPepper),
      now,
      ipScopeHash: await hashAccessToken(`verify-ip:${forwardedFor}:${windowStartedMs}`, authPepper),
      ipWindowStartedAt: new Date(windowStartedMs).toISOString(),
      ipExpiresAt: new Date(windowStartedMs + 15 * 60 * 1000).toISOString(),
      session: {
        id: crypto.randomUUID(),
        tokenHash: await hashAccessToken(accessToken, authPepper),
        createdAt: now,
        expiresAt: new Date(nowDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    if (result.status === "rate_limited") throw new ApiError(429, "verification_rate_limited", "Please wait before trying another code", undefined, { "Retry-After": "900" });
    if (result.status === "account_deletion_pending") throw new ApiError(403, "account_deletion_pending", "This account is being permanently deleted");
    if (result.status !== "success") throw new ApiError(401, "invalid_code", "Verification code is invalid or expired");
    const { user } = result;
    return Response.json({ accessToken, user: { id: user.id, email: user.email, isAdmin: isGiftAdminEmail(user.email) } }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
