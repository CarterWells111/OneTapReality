import { getServerDatabase } from "../../../../server/db/client";
import { claimGiftByTokenHash } from "../../../../server/gifts/repository";
import { hashGiftToken, requireGiftSessionEmail } from "../../../../server/gifts/session-auth";
import { ApiError, errorResponse, isErrorWithCode, notFoundResponse } from "../../../../server/http/errors";
import { requireGiftSharingEnabled } from "../../../../server/gifts/alpha-safety";
import { scheduleOpportunisticGiftMaintenance } from "../../../../server/maintenance/opportunistic-gift-maintenance";

export async function POST(request: Request, context: { token: string }) {
  try {
    requireGiftSharingEnabled();
    const now = new Date();
    const database = getServerDatabase();
    const email = await requireGiftSessionEmail(request, database, now);

    const gift = await claimGiftByTokenHash(
      database,
      await hashGiftToken(context.token),
      email,
      now.toISOString(),
    );
    if (!gift) {
      return notFoundResponse();
    }

    scheduleOpportunisticGiftMaintenance();
    return Response.json(gift, { status: 201 });
  } catch (error) {
    return errorResponse(isErrorWithCode(error, "gift_relationship_blocked")
      ? new ApiError(409, error.code, "These accounts cannot share gifts")
      : error);
  }
}
