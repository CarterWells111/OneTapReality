import { completeGiftPublishSession, createGiftPublishSession, getGiftPublishPayload, type GiftPublicationPayload } from "../../../../server/gifts/repository";
import { getR2MediaStoreFromEnvironment } from "../../../../server/gifts/r2-media";
import { requireOwnedGift } from "../../../../server/gifts/owner-access";
import { ApiError, errorResponse } from "../../../../server/http/errors";

type PublishBody = { sourceMemoryId?: string; title?: string; pages?: { position?: number; page?: unknown }[]; media?: { position?: number; contentType?: string; byteSize?: number }[] };

function preparePayload(body: PublishBody, giftId: string, publicationId: string): GiftPublicationPayload {
  if (typeof body.sourceMemoryId !== "string" || !body.sourceMemoryId.trim() || typeof body.title !== "string" || !body.title.trim()) throw new ApiError(400, "validation_failed", "A source album and title are required");
  const pages = body.pages ?? [];
  const media = body.media ?? [];
  if (pages.length > 100 || media.length > 50) throw new ApiError(400, "validation_failed", "This album is too large to publish");
  return {
    sourceMemoryId: body.sourceMemoryId.trim(),
    title: body.title.trim().slice(0, 160),
    pages: pages.map((item, position) => ({ position: item.position ?? position, page: item.page ?? {} })),
    media: media.map((item, position) => {
      if (!item.contentType?.startsWith("image/") || !Number.isInteger(item.byteSize) || item.byteSize === undefined || item.byteSize < 1 || item.byteSize > 25 * 1024 * 1024) throw new ApiError(400, "validation_failed", "Each photo must be an image smaller than 25 MB");
      return { position: item.position ?? position, contentType: item.contentType, byteSize: item.byteSize, objectKey: `gifts/${giftId}/${publicationId}/${crypto.randomUUID()}` };
    }),
  };
}

export async function POST(request: Request, { id }: { id: string }): Promise<Response> {
  try {
    const store = getR2MediaStoreFromEnvironment();
    if (!store) throw new ApiError(503, "gift_media_unavailable", "Gift media storage is not configured");
    const { db, email } = await requireOwnedGift(request, id);
    const publicationId = crypto.randomUUID();
    const now = new Date();
    const payload = preparePayload(await request.json() as PublishBody, id, publicationId);
    const expiresAt = new Date(now.getTime() + 15 * 60_000).toISOString();
    await createGiftPublishSession(db, { id: publicationId, giftId: id, ownerEmail: email, payload, createdAt: now.toISOString(), expiresAt });
    const uploads = await Promise.all(payload.media.map(async (media) => ({ position: media.position, objectKey: media.objectKey, uploadUrl: await store.createUploadUrl(media) })));
    return Response.json({ publicationId, uploads, expiresAt }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request, { id }: { id: string }): Promise<Response> {
  try {
    const { publicationId } = await request.json() as { publicationId?: string };
    if (typeof publicationId !== "string") throw new ApiError(400, "validation_failed", "A publication id is required");
    const store = getR2MediaStoreFromEnvironment();
    if (!store) throw new ApiError(503, "gift_media_unavailable", "Gift media storage is not configured");
    const { db, email } = await requireOwnedGift(request, id);
    const now = new Date().toISOString();
    const payload = await getGiftPublishPayload(db, publicationId, email, now);
    if (!payload) throw new ApiError(409, "gift_publication_unavailable", "This publication has expired or was already submitted");
    const verified = await Promise.all(payload.media.map(async (media) => {
      const metadata = await store.getObjectMetadata(media.objectKey);
      return metadata?.contentType === media.contentType && metadata.byteSize === media.byteSize;
    }));
    if (!verified.every(Boolean)) throw new ApiError(409, "gift_upload_incomplete", "All photos must finish uploading before publishing");
    const result = await completeGiftPublishSession(db, { sessionId: publicationId, ownerEmail: email, now });
    if (!result) throw new ApiError(409, "gift_publication_unavailable", "This publication has expired or was already submitted");
    return Response.json({ albumId: result.albumId }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
