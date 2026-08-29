import { getServerDatabase } from "../../../../server/db/client";
import { getGiftAccessByTokenHash } from "../../../../server/gifts/repository";
import { hashGiftToken, requireGiftSessionEmail } from "../../../../server/gifts/session-auth";
import { ApiError, errorResponse } from "../../../../server/http/errors";
import { requireGiftSharingEnabled } from "../../../../server/gifts/alpha-safety";

export async function GET(request: Request, { token }: { token: string }): Promise<Response> {
  try {
    requireGiftSharingEnabled();
    const db = getServerDatabase();
    const email = await requireGiftSessionEmail(request, db);
    const access = await getGiftAccessByTokenHash(db, await hashGiftToken(token), email);
    if (!access || access.status !== "bound") throw new ApiError(403, "gift_access_denied", "This email does not have access to this gift");
    return Response.json({ ...access, travelDate: access.travelDate ?? null });
  } catch (error) {
    return errorResponse(error);
  }
}
