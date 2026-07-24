import { getServerDatabase } from "../../../../server/db/client";
import { expireGiftCardReservations, getGiftCardDetails } from "../../../../server/gifts/repository";
import { requireGiftAdminEmail } from "../../../../server/gifts/admin-auth";
import { requireGiftSessionEmail } from "../../../../server/gifts/session-auth";
import { errorResponse, notFoundResponse } from "../../../../server/http/errors";

export async function GET(request: Request, context: { id: string }): Promise<Response> {
  try {
    const database = getServerDatabase();
    requireGiftAdminEmail(await requireGiftSessionEmail(request, database));
    await expireGiftCardReservations(database, new Date().toISOString());
    const detail = await getGiftCardDetails(database, context.id);
    return detail ? Response.json(detail) : notFoundResponse();
  } catch (error) {
    return errorResponse(error);
  }
}
