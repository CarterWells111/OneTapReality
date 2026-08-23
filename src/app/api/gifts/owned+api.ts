import { getServerDatabase } from "../../../server/db/client";
import { listOwnedGifts } from "../../../server/gifts/repository";
import { getR2MediaStoreFromEnvironment } from "../../../server/gifts/r2-media";
import { requireGiftSessionEmail } from "../../../server/gifts/session-auth";
import { ApiError, errorResponse } from "../../../server/http/errors";
import { requireGiftSharingEnabled } from "../../../server/gifts/alpha-safety";

export async function GET(request: Request): Promise<Response> {
  try {
    requireGiftSharingEnabled();
    const db = getServerDatabase();
    const email = await requireGiftSessionEmail(request, db);
    const store = getR2MediaStoreFromEnvironment();
    if (!store) throw new ApiError(503, "gift_media_unavailable", "Gift media storage is not configured");
    const rows = await listOwnedGifts(db, email);
    return Response.json({
      items: await Promise.all(rows.map(async (row) => ({
        id: row.id,
        status: row.status,
        claimedAt: row.claimedAt,
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
  } catch (error) { return errorResponse(error); }
}
