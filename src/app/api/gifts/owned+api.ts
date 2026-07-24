import { getServerDatabase } from "../../../server/db/client";
import { listOwnedGifts } from "../../../server/gifts/repository";
import { requireGiftSessionEmail } from "../../../server/gifts/session-auth";
import { errorResponse } from "../../../server/http/errors";

export async function GET(request: Request): Promise<Response> {
  try {
    const db = getServerDatabase();
    return Response.json({ items: await listOwnedGifts(db, await requireGiftSessionEmail(request, db)) });
  } catch (error) { return errorResponse(error); }
}
