import { acceptAccountDeletion } from "../../server/auth/account-deletion";
import { hashAccessToken } from "../../server/auth/device-auth";
import { requireAuthenticatedAccountSession } from "../../server/auth/session-auth";
import { getServerDatabase } from "../../server/db/client";
import { ApiError, errorResponse } from "../../server/http/errors";

export async function DELETE(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => null) as { challengeId?: unknown; code?: unknown; confirmation?: unknown } | null;
    if (!body || typeof body.challengeId !== "string" || typeof body.code !== "string" || !/^\d{6}$/u.test(body.code)) {
      throw new ApiError(400, "validation_failed", "Challenge id and six digit code are required");
    }
    if (body.confirmation !== "DELETE") {
      throw new ApiError(400, "deletion_confirmation_required", "Type DELETE to confirm permanent account deletion");
    }
    const pepper = process.env.GIFT_AUTH_PEPPER;
    if (!pepper) throw new ApiError(500, "server_configuration_missing", "Server configuration is incomplete");
    const db = getServerDatabase();
    const account = await requireAuthenticatedAccountSession(request, db);
    const nowDate = new Date();
    const result = await acceptAccountDeletion(db, {
      challengeId: body.challengeId,
      userId: account.id,
      sessionId: account.sessionId,
      codeHash: await hashAccessToken(body.code, pepper),
      confirmation: body.confirmation,
      receiptId: crypto.randomUUID(),
      now: nowDate.toISOString(),
      completeBy: new Date(nowDate.getTime() + 24 * 60 * 60_000).toISOString(),
    });
    if (result.status === "accepted") {
      return Response.json({ receiptId: result.receiptId, completeBy: result.completeBy }, { status: 202 });
    }
    if (result.status === "invalid_code") throw new ApiError(401, "invalid_deletion_code", "Deletion code is invalid");
    if (result.status === "challenge_expired") throw new ApiError(410, "deletion_challenge_expired", "Deletion challenge has expired");
    if (result.status === "challenge_used") throw new ApiError(409, "deletion_challenge_used", "Deletion challenge was already used");
    if (result.status === "confirmation_required") throw new ApiError(400, "deletion_confirmation_required", "Type DELETE to confirm permanent account deletion");
    throw new ApiError(400, "invalid_deletion_challenge", "Deletion challenge is invalid");
  } catch (error) {
    return errorResponse(error);
  }
}
