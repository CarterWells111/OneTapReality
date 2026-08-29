import { requireAuthenticatedAccount } from "../../../../../server/auth/session-auth";
import { getServerDatabase } from "../../../../../server/db/client";
import { requireGiftSharingEnabled } from "../../../../../server/gifts/alpha-safety";
import { createGiftManagementRequest, listGiftManagementTargetsForEditor, type GiftManagementAction } from "../../../../../server/gifts/repository";
import { ApiError, errorResponse } from "../../../../../server/http/errors";

export async function GET(request: Request, { id }: { id: string }): Promise<Response> {
  try {
    requireGiftSharingEnabled();
    const db = getServerDatabase();
    const account = await requireAuthenticatedAccount(request, db);
    const members = await listGiftManagementTargetsForEditor(db, { giftId: id, userId: account.id, email: account.email });
    if (!members) throw new ApiError(403, "gift_editor_required", "Activated editor access is required");
    return Response.json({ members });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, { id }: { id: string }): Promise<Response> {
  try {
    requireGiftSharingEnabled();
    const db = getServerDatabase();
    const account = await requireAuthenticatedAccount(request, db);
    const body = await request.json() as { action?: string; targetEmail?: string; targetRole?: string };
    if (body.action !== "delete_album" && body.action !== "remove_member" && body.action !== "change_member_role") throw new ApiError(400, "validation_failed", "Unknown management action");
    if (body.targetRole !== undefined && body.targetRole !== "viewer" && body.targetRole !== "editor") throw new ApiError(400, "validation_failed", "Role must be viewer or editor");
    if (body.targetEmail !== undefined && typeof body.targetEmail !== "string") throw new ApiError(400, "validation_failed", "Target email must be a string");
    const result = await createGiftManagementRequest(db, { giftId: id, userId: account.id, email: account.email, action: body.action as GiftManagementAction, targetEmail: body.targetEmail, targetRole: body.targetRole, now: new Date().toISOString() });
    if (result.status === "forbidden") throw new ApiError(403, "gift_editor_required", "Activated editor access is required");
    if (result.status === "invalid_target") throw new ApiError(400, "gift_management_target_invalid", "The requested target is not allowed");
    if (result.status === "duplicate") throw new ApiError(409, "gift_management_request_pending", "An equivalent request is already pending");
    if (result.status !== "created") throw new ApiError(500, "internal_error", "Unexpected management request result");
    return Response.json({ request: result.request }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
