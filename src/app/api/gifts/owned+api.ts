import { getServerDatabase } from "../../../server/db/client";
import { listOwnedGifts } from "../../../server/gifts/repository";
import { requireGiftSessionEmail } from "../../../server/gifts/session-auth";
import { errorResponse } from "../../../server/http/errors";
import { requireGiftSharingEnabled } from "../../../server/gifts/alpha-safety";

export async function GET(request: Request): Promise<Response> {
  try {
    requireGiftSharingEnabled();
    const db = getServerDatabase();
    return Response.json({ items: await listOwnedGifts(db, await requireGiftSessionEmail(request, db)) });
  } catch (error) { return errorResponse(error); }
}
