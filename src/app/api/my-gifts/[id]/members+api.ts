import { addGiftMember, listGiftMembers, removeGiftMember } from "../../../../server/gifts/repository";
import { requireOwnedGift } from "../../../../server/gifts/owner-access";
import { ApiError, errorResponse } from "../../../../server/http/errors";
import { scheduleOpportunisticGiftMaintenance } from "../../../../server/maintenance/opportunistic-gift-maintenance";

export async function GET(request: Request, { id }: { id: string }): Promise<Response> {
  try {
    const { db } = await requireOwnedGift(request, id);
    return Response.json({ members: await listGiftMembers(db, id) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, { id }: { id: string }): Promise<Response> {
  try {
    const { email, db } = await requireOwnedGift(request, id);
    const body = await request.json() as { email?: string };
    if (typeof body.email !== "string" || !body.email.includes("@")) throw new ApiError(400, "validation_failed", "A valid email is required");
    if (body.email.trim().toLowerCase() === email) throw new ApiError(409, "gift_member_exists", "The owner already has access");
    if (!await addGiftMember(db, id, body.email, new Date().toISOString())) throw new ApiError(409, "gift_member_limit", "This gift already has three access emails or that email is listed");
    const members = await listGiftMembers(db, id);
    scheduleOpportunisticGiftMaintenance();
    return Response.json({ members }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, { id }: { id: string }): Promise<Response> {
  try {
    const { db } = await requireOwnedGift(request, id);
    const body = await request.json() as { email?: string };
    if (typeof body.email !== "string" || !await removeGiftMember(db, id, body.email)) throw new ApiError(404, "gift_member_not_found", "That invited email was not found");
    scheduleOpportunisticGiftMaintenance();
    return new Response(null, { status: 204 });
  } catch (error) { return errorResponse(error); }
}
