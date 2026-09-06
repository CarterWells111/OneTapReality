import { z } from "zod";

import { getServerDatabase } from "../../../../server/db/client";
import { expireGiftCardReservations, getGiftCardDetails, updateGiftCardMetadata } from "../../../../server/gifts/repository";
import { requireGiftAdminEmail } from "../../../../server/gifts/admin-auth";
import { requireGiftSessionEmail } from "../../../../server/gifts/session-auth";
import { errorResponse, notFoundResponse } from "../../../../server/http/errors";

const metadataSchema = z.object({
  name: z.string().trim().max(80).nullable().optional(),
  note: z.string().trim().max(240).nullable().optional(),
}).strict().refine(
  (value) => Object.hasOwn(value, "name") || Object.hasOwn(value, "note"),
  { message: "At least one metadata field is required." },
);

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

export async function PATCH(request: Request, context: { id: string }): Promise<Response> {
  try {
    const database = getServerDatabase();
    const adminEmail = requireGiftAdminEmail(await requireGiftSessionEmail(request, database));
    const body = metadataSchema.parse(await request.json());
    const metadata = {
      ...(Object.hasOwn(body, "name") ? { name: body.name?.trim() || null } : {}),
      ...(Object.hasOwn(body, "note") ? { note: body.note?.trim() || null } : {}),
    };
    const card = await updateGiftCardMetadata(database, context.id, metadata, adminEmail, new Date().toISOString());
    return card ? Response.json({ card }) : notFoundResponse();
  } catch (error) {
    return errorResponse(error);
  }
}
