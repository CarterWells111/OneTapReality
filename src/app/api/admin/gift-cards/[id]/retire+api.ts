import { getServerDatabase } from "../../../../../server/db/client";
import { expireGiftCardReservations, retireGiftCard } from "../../../../../server/gifts/repository";
import { requireGiftAdminEmail } from "../../../../../server/gifts/admin-auth";
import { requireGiftSessionEmail } from "../../../../../server/gifts/session-auth";
import { errorResponse, notFoundResponse } from "../../../../../server/http/errors";
import { scheduleOpportunisticGiftMaintenance } from "../../../../../server/maintenance/opportunistic-gift-maintenance";

export async function POST(request: Request, context: { id: string }): Promise<Response> {
  try {
    const database = getServerDatabase();
    const email = requireGiftAdminEmail(await requireGiftSessionEmail(request, database));
    const now = new Date().toISOString();
    await expireGiftCardReservations(database, now);
    if (!await retireGiftCard(database, context.id, email, now)) return notFoundResponse();
    scheduleOpportunisticGiftMaintenance();
    return Response.json({ retired: true });
  } catch (error) {
    return errorResponse(error);
  }
}
