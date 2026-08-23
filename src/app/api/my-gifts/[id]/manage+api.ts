import { getSharedAlbumSnapshot, listGiftMembers } from "../../../../server/gifts/repository";
import { requireOwnedGift } from "../../../../server/gifts/owner-access";
import { errorResponse } from "../../../../server/http/errors";
import { sharedAlbums } from "../../../../server/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: Request, { id }: { id: string }): Promise<Response> {
  try {
    const { db, gift } = await requireOwnedGift(request, id);
    const members = await listGiftMembers(db, id);
    const [album] = await db.select().from(sharedAlbums).where(eq(sharedAlbums.giftId, id)).limit(1);
    const snapshot = album ? await getSharedAlbumSnapshot(db, album.id) : null;
    return Response.json({
      gift,
      members,
      album: snapshot ? { id: snapshot.album.id, title: snapshot.album.title, travelDate: snapshot.album.travelDate ?? null, sourceMemoryId: snapshot.album.sourceMemoryId, publishedAt: snapshot.album.publishedAt, version: snapshot.album.version, mediaCount: snapshot.media.length } : null,
    });
  } catch (error) { return errorResponse(error); }
}
