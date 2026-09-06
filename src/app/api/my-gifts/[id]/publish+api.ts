import { createGiftPublishSession, getGiftPublishPayload, GiftAlbumVersionConflictError, GiftPublicationUnavailableError, resolveExistingGiftMedia } from "../../../../server/gifts/repository";
import { getR2MediaStoreFromEnvironment } from "../../../../server/gifts/r2-media";
import { requireOwnedGift } from "../../../../server/gifts/owner-access";
import { ApiError, errorResponse } from "../../../../server/http/errors";
import { scheduleOpportunisticGiftMaintenance } from "../../../../server/maintenance/opportunistic-gift-maintenance";
import { finalizeSharedPublication, GIFT_PUBLICATION_LIFETIME_MS, prepareSharedPublication, selectRefreshableUploads, type RefreshPublishUploadsBody, type SharedPublishBody } from "../../../../server/gifts/shared-publication";

export async function POST(request: Request, { id }: { id: string }): Promise<Response> {
  try {
    const store = getR2MediaStoreFromEnvironment();
    if (!store) throw new ApiError(503, "gift_media_unavailable", "Gift media storage is not configured");
    const { db, email } = await requireOwnedGift(request, id);
    const publicationId = crypto.randomUUID();
    const now = new Date();
    const body = await request.json() as SharedPublishBody;
    const { baseVersion, payload, existingMedia } = prepareSharedPublication(body as unknown as SharedPublishBody, id, publicationId, { allowExistingMedia: true });
    const newMedia = [...payload.media];
    const resolved = await resolveExistingGiftMedia(db, id, baseVersion, existingMedia);
    if (!resolved) throw new ApiError(400, "gift_media_reference_invalid", "Existing media must belong to the current shared album");
    payload.media.push(...resolved);
    const expiresAt = new Date(now.getTime() + GIFT_PUBLICATION_LIFETIME_MS).toISOString();
    await createGiftPublishSession(db, { id: publicationId, giftId: id, ownerEmail: email, baseVersion, payload, createdAt: now.toISOString(), expiresAt });
    const uploads = await Promise.all(newMedia.map(async (media) => ({ position: media.position, objectKey: media.objectKey, uploadUrl: await store.createUploadUrl(media) })));
    const coverUpload = payload.cover ? { uploadUrl: await store.createUploadUrl(payload.cover) } : null;
    scheduleOpportunisticGiftMaintenance();
    return Response.json({ publicationId, uploads, coverUpload, expiresAt }, { status: 201 });
  } catch (error) { return errorResponse(error instanceof GiftAlbumVersionConflictError || error instanceof GiftPublicationUnavailableError ? new ApiError(409, error.code, error.message) : error); }
}

export async function PUT(request: Request, { id }: { id: string }): Promise<Response> {
  try {
    const { publicationId } = await request.json() as { publicationId?: string };
    if (typeof publicationId !== "string") throw new ApiError(400, "validation_failed", "A publication id is required");
    const { db, email } = await requireOwnedGift(request, id);
    const now = new Date().toISOString();
    const result = await finalizeSharedPublication({ store: getR2MediaStoreFromEnvironment(), db, giftId: id, sessionId: publicationId, ownerEmail: email, now });
    scheduleOpportunisticGiftMaintenance();
    return Response.json(result, { status: 201 });
  } catch (error) { return errorResponse(error instanceof GiftAlbumVersionConflictError || error instanceof GiftPublicationUnavailableError ? new ApiError(409, error.code, error.message) : error); }
}

export async function PATCH(request: Request, { id }: { id: string }): Promise<Response> {
  try {
    const { db, email } = await requireOwnedGift(request, id);
    const body = await request.json() as RefreshPublishUploadsBody;
    if (typeof body.publicationId !== "string") throw new ApiError(400, "validation_failed", "A publication id is required");
    const payload = await getGiftPublishPayload(db, body.publicationId, id, email, new Date().toISOString());
    if (!payload) throw new ApiError(409, "gift_publication_unavailable", "This publication has expired or was already submitted");
    const selected = selectRefreshableUploads(body, payload);
    const store = getR2MediaStoreFromEnvironment();
    if (!store) throw new ApiError(503, "gift_media_unavailable", "Gift media storage is not configured");
    const uploads = await Promise.all(selected.media.map(async (media) => ({ position: media.position, uploadUrl: await store.createUploadUrl(media) })));
    const coverUpload = selected.cover ? { uploadUrl: await store.createUploadUrl(selected.cover) } : null;
    return Response.json({ uploads, coverUpload });
  } catch (error) { return errorResponse(error); }
}
