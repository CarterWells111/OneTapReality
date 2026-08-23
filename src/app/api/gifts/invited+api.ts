import { getServerDatabase } from "../../../server/db/client";
import { listInvitedGifts } from "../../../server/gifts/repository";
import { getR2MediaStoreFromEnvironment } from "../../../server/gifts/r2-media";
import { ApiError, errorResponse } from "../../../server/http/errors";
import { requireAlphaEmailAllowed, requireGiftSharingEnabled } from "../../../server/gifts/alpha-safety";
import { requireAuthenticatedAccount } from "../../../server/auth/session-auth";

export async function GET(request: Request): Promise<Response> {
  try {
    requireGiftSharingEnabled();
    const db = getServerDatabase();
    const account = await requireAuthenticatedAccount(request, db);
    requireAlphaEmailAllowed(account.email);
    const store = getR2MediaStoreFromEnvironment();
    if (!store) throw new ApiError(503, "gift_media_unavailable", "Gift media storage is not configured");
    const rows = await listInvitedGifts(db, account.id, account.email);
    return Response.json({
      items: await Promise.all(rows.map(async (row) => ({
        giftId: row.giftId,
        role: row.role,
        album: row.albumId
          ? {
              title: row.albumTitle,
              travelDate: row.travelDate ?? null,
              albumId: row.albumId,
              publishedAt: row.publishedAt,
              version: row.version,
              cover: row.coverObjectKey
                ? {
                    readUrl: await store.createReadUrl(row.coverObjectKey),
                    contentType: row.coverContentType,
                    byteSize: row.coverByteSize,
                  }
                : null,
            }
          : null,
      }))),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
