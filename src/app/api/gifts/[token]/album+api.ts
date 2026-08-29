import { getServerDatabase } from "../../../../server/db/client";
import { getActivatedGiftAccessByGiftId, getGiftAccessByTokenHash, getSharedAlbumSnapshot } from "../../../../server/gifts/repository";
import { getR2MediaStoreFromEnvironment } from "../../../../server/gifts/r2-media";
import { hashGiftToken } from "../../../../server/gifts/session-auth";
import { ApiError, errorResponse } from "../../../../server/http/errors";
import { requireAlphaEmailAllowed, requireGiftSharingEnabled } from "../../../../server/gifts/alpha-safety";
import { requireAuthenticatedAccount } from "../../../../server/auth/session-auth";

export async function GET(request: Request, { token }: { token: string }): Promise<Response> {
  try {
    requireGiftSharingEnabled();
    const db = getServerDatabase();
    const account = await requireAuthenticatedAccount(request, db);
    requireAlphaEmailAllowed(account.email);
    const access = await getGiftAccessByTokenHash(db, await hashGiftToken(token), account.email);
    if (!access || access.status !== "bound" || !access.albumId) throw new ApiError(403, "gift_access_denied", "This email does not have access to a published album");
    if (access.role !== "owner" && !await getActivatedGiftAccessByGiftId(db, access.id, account.id, account.email)) {
      throw new ApiError(403, "gift_activation_required", "Touch the gift to activate member access first");
    }
    const snapshot = await getSharedAlbumSnapshot(db, access.albumId);
    if (!snapshot) throw new ApiError(404, "gift_album_not_found", "No shared album has been published yet");
    const store = getR2MediaStoreFromEnvironment();
    if (!store) throw new ApiError(503, "gift_media_unavailable", "Gift media storage is not configured");
    return Response.json({
      title: snapshot.album.title,
      travelDate: snapshot.album.travelDate ?? null,
      publishedAt: snapshot.album.publishedAt,
      version: snapshot.album.version,
      cover: snapshot.album.coverObjectKey
        ? {
            readUrl: await store.createReadUrl(snapshot.album.coverObjectKey),
            contentType: snapshot.album.coverContentType,
            byteSize: snapshot.album.coverByteSize,
          }
        : null,
      pages: snapshot.pages,
      media: await Promise.all(snapshot.media.map(async (media) => ({ ...media, readUrl: await store.createReadUrl(media.objectKey), objectKey: undefined }))),
    });
  } catch (error) { return errorResponse(error); }
}
