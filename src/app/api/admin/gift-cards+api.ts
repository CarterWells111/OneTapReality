import { z } from "zod";

import { createAccessToken } from "../../../server/auth/device-auth";
import { getServerDatabase } from "../../../server/db/client";
import {
  createInitializingGiftCard,
  expireGiftCardReservations,
  type GiftCardFilters,
  listGiftCards,
} from "../../../server/gifts/repository";
import { requireGiftAdminEmail } from "../../../server/gifts/admin-auth";
import { hashGiftToken, requireGiftSessionEmail } from "../../../server/gifts/session-auth";
import { errorResponse } from "../../../server/http/errors";
import { getGiftUrlOrigin, requireGiftSharingEnabled } from "../../../server/gifts/alpha-safety";
import { scheduleOpportunisticGiftMaintenance } from "../../../server/maintenance/opportunistic-gift-maintenance";

const reservationSchema = z.object({ note: z.string().trim().max(240).optional() });
const reservationDurationMs = 15 * 60 * 1000;

function createCardCode(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `CARD-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function isGiftCardCodeConflict(error: unknown): boolean {
  const databaseError = error as { code?: unknown; constraint?: unknown } | null;
  return databaseError?.code === "23505" && databaseError.constraint === "gift_cards_code_unique";
}

async function requireAdmin(request: Request, database: ReturnType<typeof getServerDatabase>): Promise<string> {
  return requireGiftAdminEmail(await requireGiftSessionEmail(request, database));
}

export async function GET(request: Request): Promise<Response> {
  try {
    const database = getServerDatabase();
    await requireAdmin(request, database);
    await expireGiftCardReservations(database, new Date().toISOString());
    const url = new URL(request.url);
    const filters: GiftCardFilters = {
      state: url.searchParams.get("state") || undefined,
      search: url.searchParams.get("search") || undefined,
    };
    return Response.json({ items: await listGiftCards(database, filters) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireGiftSharingEnabled();
    const database = getServerDatabase();
    const adminEmail = await requireAdmin(request, database);
    const body = reservationSchema.parse(await request.json());
    const now = new Date();
    const expiresAt = new Date(now.getTime() + reservationDurationMs).toISOString();
    await expireGiftCardReservations(database, now.toISOString());
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const giftToken = createAccessToken();
      const cardId = crypto.randomUUID();
      const cardCode = createCardCode();
      try {
        const card = await createInitializingGiftCard(database, {
          cardId,
          cardCode,
          giftId: crypto.randomUUID(),
          tokenHash: await hashGiftToken(giftToken),
          note: body.note || null,
          adminEmail,
          createdAt: now.toISOString(),
          expiresAt,
        });
        scheduleOpportunisticGiftMaintenance();
        return Response.json({
          cardId,
          displayNumber: card.displayNumber,
          cardCode,
          giftUrl: `${getGiftUrlOrigin()}/gift/${giftToken}`,
          expiresAt,
        }, { status: 201 });
      } catch (error) {
        if (!isGiftCardCodeConflict(error) || attempt === 2) throw error;
      }
    }

    throw new Error("Gift card reservation could not be created");
  } catch (error) {
    return errorResponse(error);
  }
}
