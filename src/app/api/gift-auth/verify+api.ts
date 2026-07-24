import { createAccessToken, hashAccessToken } from "../../../server/auth/device-auth";
import { getServerDatabase } from "../../../server/db/client";
import { normalizeGiftEmail } from "../../../server/gifts/email-auth";
import { consumeGiftEmailCode, createGiftSession } from "../../../server/gifts/repository";
import { ApiError, errorResponse } from "../../../server/http/errors";

export async function POST(request: Request): Promise<Response> {
  try {
    const { email: rawEmail, code } = await request.json() as { email?: string; code?: string };
    if (typeof rawEmail !== "string" || !/^\d{6}$/u.test(code ?? "")) throw new ApiError(400, "validation_failed", "Email and six digit code are required");
    const pepper = process.env.GIFT_AUTH_PEPPER;
    if (!pepper) throw new ApiError(500, "server_configuration_missing", "Server configuration is incomplete");
    const email = normalizeGiftEmail(rawEmail);
    const now = new Date().toISOString();
    const db = getServerDatabase();
    if (!await consumeGiftEmailCode(db, email, await hashAccessToken(code!, pepper), now)) throw new ApiError(401, "invalid_code", "Verification code is invalid or expired");
    const accessToken = createAccessToken();
    await createGiftSession(db, { id: crypto.randomUUID(), email, tokenHash: await hashAccessToken(accessToken, pepper), createdAt: now, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });
    return Response.json({ accessToken, email }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
