import { getServerDatabase } from "../../../../../server/db/client";
import { activateGiftCard, expireGiftCardReservations } from "../../../../../server/gifts/repository";
import { requireGiftAdminEmail } from "../../../../../server/gifts/admin-auth";
import { requireGiftSessionEmail } from "../../../../../server/gifts/session-auth";
import { errorResponse, notFoundResponse } from "../../../../../server/http/errors";

export async function POST(request: Request, context: { id: string }): Promise<Response> {
  try {
    const database = getServerDatabase();
    const email = requireGiftAdminEmail(await requireGiftSessionEmail(request, database));
    const now = new Date().toISOString();
    await expireGiftCardReservations(database, now);
    if (!await activateGiftCard(database, context.id, email, now)) return notFoundResponse();
    return Response.json({ activated: true });
  } catch (error) {
    return errorResponse(error);
  }
}
