import { decideGiftManagementRequest, listGiftManagementRequestsForOwner } from "../../../../server/gifts/repository";
import { requireOwnedGift } from "../../../../server/gifts/owner-access";
import { ApiError, errorResponse, isErrorWithCode } from "../../../../server/http/errors";
import { scheduleOpportunisticGiftMaintenance } from "../../../../server/maintenance/opportunistic-gift-maintenance";

export async function GET(request: Request, { id }: { id: string }): Promise<Response> {
  try {
    const { db, email } = await requireOwnedGift(request, id);
    return Response.json({ requests: await listGiftManagementRequestsForOwner(db, id, email) ?? [] });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, { id }: { id: string }): Promise<Response> {
  try {
    const { db, email } = await requireOwnedGift(request, id);
    const body = await request.json() as { requestId?: string; decision?: string };
    if (typeof body.requestId !== "string" || (body.decision !== "approved" && body.decision !== "rejected")) throw new ApiError(400, "validation_failed", "Request id and approved/rejected decision are required");
    const result = await decideGiftManagementRequest(db, { giftId: id, requestId: body.requestId, ownerEmail: email, decision: body.decision, now: new Date().toISOString() });
    if (result.status === "forbidden") throw new ApiError(403, "gift_owner_required", "Only the gift owner can decide requests");
    if (result.status === "not_pending") throw new ApiError(409, "gift_management_request_not_pending", "This request is not pending");
    if (result.status === "requester_ineligible") throw new ApiError(409, "gift_management_requester_ineligible", "The requester is no longer an activated editor");
    if (result.status === "invalid_target") throw new ApiError(409, "gift_management_target_invalid", "The request target is no longer eligible");
    if (result.status === "approved") scheduleOpportunisticGiftMaintenance();
    return Response.json({ status: result.status });
  } catch (error) {
    return errorResponse(isErrorWithCode(error, "gift_relationship_blocked")
      ? new ApiError(409, error.code, "These accounts cannot share gifts")
      : error);
  }
}
