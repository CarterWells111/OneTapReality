import { requireAuthenticatedAccount } from "../../../../server/auth/session-auth";
import { getServerDatabase } from "../../../../server/db/client";
import { requireAlphaEmailAllowed, requireGiftSharingEnabled } from "../../../../server/gifts/alpha-safety";
import { activateGiftViewerByTokenHash } from "../../../../server/gifts/repository";
import { hashGiftToken } from "../../../../server/gifts/session-auth";
import { ApiError, errorResponse } from "../../../../server/http/errors";

export async function POST(request: Request, { token }: { token: string }): Promise<Response> {
  try {
    requireGiftSharingEnabled();
    const db = getServerDatabase();
    const account = await requireAuthenticatedAccount(request, db);
    requireAlphaEmailAllowed(account.email);
    const activation = await activateGiftViewerByTokenHash(db, await hashGiftToken(token), account, new Date().toISOString());
    if (!activation) throw new ApiError(403, "gift_activation_denied", "This account is not eligible to activate this gift");
    return Response.json(activation);
  } catch (error) {
    return errorResponse(error);
  }
}
