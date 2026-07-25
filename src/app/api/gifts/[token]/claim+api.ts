import { getServerDatabase } from "../../../../server/db/client";
import { claimGiftByTokenHash } from "../../../../server/gifts/repository";
import { hashGiftToken, requireGiftSessionEmail } from "../../../../server/gifts/session-auth";
import { errorResponse, notFoundResponse } from "../../../../server/http/errors";

export async function POST(request: Request, context: { token: string }) {
  try {
    const now = new Date();
    const database = getServerDatabase();
    const email = await requireGiftSessionEmail(request, database, now);

    const gift = await claimGiftByTokenHash(
      database,
      await hashGiftToken(context.token),
      email,
      now.toISOString(),
    );
    if (!gift) {
      return notFoundResponse();
    }

    return Response.json(gift, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
