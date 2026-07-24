import { getServerDatabase } from "../../../../server/db/client";
import { addGiftMember, getGiftAccessByTokenHash, listGiftMembers, removeGiftMember } from "../../../../server/gifts/repository";
import { hashGiftToken, requireGiftSessionEmail } from "../../../../server/gifts/session-auth";
import { ApiError, errorResponse } from "../../../../server/http/errors";

async function requireOwner(request: Request, token: string) {
  const db = getServerDatabase();
  const email = await requireGiftSessionEmail(request, db);
  const access = await getGiftAccessByTokenHash(db, await hashGiftToken(token), email);
  if (!access || access.status !== "bound" || access.role !== "owner") throw new ApiError(403, "gift_owner_required", "Only the gift owner can manage access");
  return { db, giftId: access.id };
}

export async function GET(request: Request, { token }: { token: string }): Promise<Response> {
  try {
    const { db, giftId } = await requireOwner(request, token);
    return Response.json({ members: await listGiftMembers(db, giftId), maximumMembers: 3 });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, { token }: { token: string }): Promise<Response> {
  try {
    const { email } = await request.json() as { email?: string };
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim())) throw new ApiError(400, "validation_failed", "A valid email is required");
    const { db, giftId } = await requireOwner(request, token);
    if (!await addGiftMember(db, giftId, email, new Date().toISOString())) throw new ApiError(409, "gift_member_limit_or_duplicate", "The email is already listed or this gift already has three members");
    return Response.json({ members: await listGiftMembers(db, giftId), maximumMembers: 3 }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, { token }: { token: string }): Promise<Response> {
  try {
    const { email } = await request.json() as { email?: string };
    if (typeof email !== "string") throw new ApiError(400, "validation_failed", "An email is required");
    const { db, giftId } = await requireOwner(request, token);
    if (!await removeGiftMember(db, giftId, email)) throw new ApiError(404, "gift_member_not_found", "Only invited viewers can be removed");
    return Response.json({ members: await listGiftMembers(db, giftId), maximumMembers: 3 });
  } catch (error) { return errorResponse(error); }
}
