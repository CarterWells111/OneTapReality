import { disableGift } from "../../../../server/gifts/repository";
import { requireOwnedGift } from "../../../../server/gifts/owner-access";
import { ApiError, errorResponse } from "../../../../server/http/errors";
import { scheduleOpportunisticGiftMaintenance } from "../../../../server/maintenance/opportunistic-gift-maintenance";

export async function POST(request: Request, { id }: { id: string }): Promise<Response> {
  try {
    // 停用是 P0 处置手段，停测开关关闭期间必须保持可用。
    const { db } = await requireOwnedGift(request, id, { allowWhileSharingPaused: true });
    if (!await disableGift(db, id, new Date().toISOString())) throw new ApiError(409, "gift_disable_failed", "This gift can no longer be disabled");
    scheduleOpportunisticGiftMaintenance();
    return new Response(null, { status: 204 });
  } catch (error) { return errorResponse(error); }
}
