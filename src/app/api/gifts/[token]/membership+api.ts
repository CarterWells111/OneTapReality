import { requireAuthenticatedAccount } from "../../../../server/auth/session-auth";
import { getServerDatabase } from "../../../../server/db/client";
import { requireAlphaEmailAllowed, requireGiftSharingEnabled } from "../../../../server/gifts/alpha-safety";
import { leaveGiftMembership } from "../../../../server/gifts/content-safety";
import { ApiError, errorResponse } from "../../../../server/http/errors";

export async function DELETE(request: Request, { token: giftId }: { token: string }): Promise<Response> {
  try {
    requireGiftSharingEnabled();
    const db = getServerDatabase();
    const account = await requireAuthenticatedAccount(request, db);
    requireAlphaEmailAllowed(account.email);
    const result = await leaveGiftMembership(db, { giftId, userId: account.id, email: account.email });
    if (result.status === "owner_forbidden") throw new ApiError(409, "gift_owner_cannot_leave", "The gift owner must permanently disable the gift instead");
    if (result.status === "forbidden") throw new ApiError(403, "gift_leave_forbidden", "This account cannot leave this gift");
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
