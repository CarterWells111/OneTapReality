import { eq } from "drizzle-orm";

import { sharedAlbums } from "../../../../server/db/schema";
import { requireOwnedGift } from "../../../../server/gifts/owner-access";
import { getR2MediaStoreFromEnvironment } from "../../../../server/gifts/r2-media";
import { getSharedAlbumSnapshot } from "../../../../server/gifts/repository";
import { ApiError, errorResponse } from "../../../../server/http/errors";

export async function GET(request: Request, { id }: { id: string }): Promise<Response> {
  try {
    const { db } = await requireOwnedGift(request, id);
    const [album] = await db.select({ id: sharedAlbums.id }).from(sharedAlbums).where(eq(sharedAlbums.giftId, id)).limit(1);
    if (!album) throw new ApiError(404, "gift_album_not_found", "No shared album has been published yet");
    const snapshot = await getSharedAlbumSnapshot(db, album.id);
    if (!snapshot) throw new ApiError(404, "gift_album_not_found", "No shared album has been published yet");
    const store = getR2MediaStoreFromEnvironment();
    if (!store) throw new ApiError(503, "gift_media_unavailable", "Gift media storage is not configured");
    return Response.json({
      role: "owner",
      title: snapshot.album.title,
      publishedAt: snapshot.album.publishedAt,
      version: snapshot.album.version,
      cover: snapshot.album.coverObjectKey
        ? { readUrl: await store.createReadUrl(snapshot.album.coverObjectKey), contentType: snapshot.album.coverContentType, byteSize: snapshot.album.coverByteSize }
        : null,
      pages: snapshot.pages,
      media: await Promise.all(snapshot.media.map(async ({ objectKey, ...media }) => ({ ...media, readUrl: await store.createReadUrl(objectKey) }))),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
