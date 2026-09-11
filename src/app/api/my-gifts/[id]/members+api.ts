import { addGiftMember, listGiftMembers, removeGiftMember, rollbackGiftMemberInvitation, updateGiftMemberRole } from "../../../../server/gifts/repository";
import { requireOwnedGift } from "../../../../server/gifts/owner-access";
import { requireAlphaEmailAllowed } from "../../../../server/gifts/alpha-safety";
import { normalizeGiftEmail } from "../../../../server/gifts/email-auth";
import { sendGiftInvitationEmail } from "../../../../server/gifts/resend-email-sender";
import { ApiError, errorResponse, isErrorWithCode } from "../../../../server/http/errors";
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
    const body = await request.json() as { email?: string; role?: string };
    if (typeof body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(body.email.trim())) throw new ApiError(400, "validation_failed", "A valid email is required");
    const invitedEmail = normalizeGiftEmail(body.email);
    if (invitedEmail === email) throw new ApiError(409, "gift_member_exists", "The owner already has access");
    if (body.role !== "viewer" && body.role !== "editor") throw new ApiError(400, "validation_failed", "Role must be viewer or editor");
    requireAlphaEmailAllowed(invitedEmail);
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.GIFT_EMAIL_FROM;
    if (!apiKey || !from) throw new ApiError(503, "gift_invitation_unavailable", "Gift invitation email is not configured");
    if (!await addGiftMember(db, id, invitedEmail, new Date().toISOString(), body.role)) throw new ApiError(409, "gift_member_limit", "This gift already has three access emails or that email is listed");
    try {
      await sendGiftInvitationEmail({ apiKey, from, email: invitedEmail, role: body.role });
    } catch (error) {
      await rollbackGiftMemberInvitation(db, id, invitedEmail);
      throw error;
    }
    const members = await listGiftMembers(db, id);
    scheduleOpportunisticGiftMaintenance();
    return Response.json({ members }, { status: 201 });
  } catch (error) { return errorResponse(isErrorWithCode(error, "gift_relationship_blocked") ? new ApiError(409, error.code, "These accounts cannot share gifts") : error); }
}

export async function PATCH(request: Request, { id }: { id: string }): Promise<Response> {
  try {
    const { db } = await requireOwnedGift(request, id);
    const body = await request.json() as { email?: string; role?: string };
    if (typeof body.email !== "string" || (body.role !== "viewer" && body.role !== "editor")) throw new ApiError(400, "validation_failed", "Email and a viewer/editor role are required");
    if (!await updateGiftMemberRole(db, id, body.email, body.role)) throw new ApiError(404, "gift_member_not_found", "That invited member was not found");
    return Response.json({ members: await listGiftMembers(db, id) });
  } catch (error) { return errorResponse(isErrorWithCode(error, "gift_relationship_blocked") ? new ApiError(409, error.code, "These accounts cannot share gifts") : error); }
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
