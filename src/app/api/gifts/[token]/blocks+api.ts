import { requireAuthenticatedAccount } from "../../../../server/auth/session-auth";
import { getServerDatabase } from "../../../../server/db/client";
import { requireAlphaEmailAllowed, requireGiftSharingEnabled } from "../../../../server/gifts/alpha-safety";
import { blockGiftUser } from "../../../../server/gifts/content-safety";
import { ApiError, errorResponse } from "../../../../server/http/errors";

export async function POST(request: Request, { token: giftId }: { token: string }): Promise<Response> {
  try {
    requireGiftSharingEnabled();
    const db = getServerDatabase();
    const account = await requireAuthenticatedAccount(request, db);
    requireAlphaEmailAllowed(account.email);
    const parsedBody: unknown = await request.json().catch(() => {
      throw new ApiError(400, "validation_failed", "Request body must be valid JSON");
    });
    if (typeof parsedBody !== "object" || parsedBody === null || Array.isArray(parsedBody)) {
      throw new ApiError(400, "validation_failed", "Request body must be an object");
    }
    const body = parsedBody as { targetUserId?: unknown; targetEmail?: unknown };
    if (body.targetUserId !== undefined && typeof body.targetUserId !== "string") {
      throw new ApiError(400, "validation_failed", "Target user id must be a string");
    }
    if (body.targetEmail !== undefined && (typeof body.targetEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(body.targetEmail.trim()))) {
      throw new ApiError(400, "validation_failed", "Target email must be valid");
    }

    const result = await blockGiftUser(db, {
      giftId,
      actorUserId: account.id,
      actorEmail: account.email,
      targetUserId: body.targetUserId as string | undefined,
      targetEmail: body.targetEmail as string | undefined,
      now: new Date().toISOString(),
    });
    if (result.status === "forbidden") throw new ApiError(403, "gift_block_forbidden", "This account cannot change access for this gift");
    if (result.status === "invalid_target") throw new ApiError(409, "gift_block_invalid_target", "Choose a current gift relationship other than yourself");
    return Response.json({ status: result.status, block: { id: result.block.id } }, { status: result.status === "created" ? 201 : 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
