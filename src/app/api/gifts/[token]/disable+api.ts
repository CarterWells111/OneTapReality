import { getServerDatabase } from "../../../../server/db/client";
import { disableGift, getGiftAccessByTokenHash } from "../../../../server/gifts/repository";
import { hashGiftToken, requireGiftSessionEmail } from "../../../../server/gifts/session-auth";
import { ApiError, errorResponse } from "../../../../server/http/errors";
import { scheduleOpportunisticGiftMaintenance } from "../../../../server/maintenance/opportunistic-gift-maintenance";

export async function POST(request: Request, { token }: { token: string }): Promise<Response> {
  try {
    const db = getServerDatabase();
    const email = await requireGiftSessionEmail(request, db);
    const access = await getGiftAccessByTokenHash(db, await hashGiftToken(token), email);
    if (!access || access.status !== "bound" || access.role !== "owner") throw new ApiError(403, "gift_owner_required", "Only the gift owner can disable this gift");
    if (!await disableGift(db, access.id, new Date().toISOString())) throw new ApiError(409, "gift_disable_failed", "This gift can no longer be disabled");
    scheduleOpportunisticGiftMaintenance();
    return new Response(null, { status: 204 });
  } catch (error) { return errorResponse(error); }
}
