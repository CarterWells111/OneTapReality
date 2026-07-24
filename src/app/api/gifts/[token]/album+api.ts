import { getServerDatabase } from "../../../../server/db/client";
import { getGiftAccessByTokenHash, getSharedAlbumSnapshot } from "../../../../server/gifts/repository";
import { getR2MediaStoreFromEnvironment } from "../../../../server/gifts/r2-media";
import { hashGiftToken, requireGiftSessionEmail } from "../../../../server/gifts/session-auth";
import { ApiError, errorResponse } from "../../../../server/http/errors";

export async function GET(request: Request, { token }: { token: string }): Promise<Response> {
  try {
    const db = getServerDatabase();
    const email = await requireGiftSessionEmail(request, db);
    const access = await getGiftAccessByTokenHash(db, await hashGiftToken(token), email);
    if (!access || access.status !== "bound" || !access.albumId) throw new ApiError(403, "gift_access_denied", "This email does not have access to a published album");
    const snapshot = await getSharedAlbumSnapshot(db, access.albumId);
    if (!snapshot) throw new ApiError(404, "gift_album_not_found", "No shared album has been published yet");
    const store = getR2MediaStoreFromEnvironment();
    if (!store) throw new ApiError(503, "gift_media_unavailable", "Gift media storage is not configured");
    return Response.json({
      title: snapshot.album.title,
      publishedAt: snapshot.album.publishedAt,
      version: snapshot.album.version,
      pages: snapshot.pages,
      media: await Promise.all(snapshot.media.map(async (media) => ({ ...media, readUrl: await store.createReadUrl(media.objectKey), objectKey: undefined }))),
    });
  } catch (error) { return errorResponse(error); }
}
