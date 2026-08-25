import { completeGiftPublishSessionResult, createGiftPublishSession, getGiftPublishPayload, GiftAlbumVersionConflictError, GiftPublicationUnavailableError, resolveExistingGiftMedia } from "../../../../server/gifts/repository";
import { getR2MediaStoreFromEnvironment } from "../../../../server/gifts/r2-media";
import { requireOwnedGift } from "../../../../server/gifts/owner-access";
import { ApiError, errorResponse } from "../../../../server/http/errors";
import { scheduleOpportunisticGiftMaintenance } from "../../../../server/maintenance/opportunistic-gift-maintenance";
import { prepareSharedPublication, promoteSharedPublicationDurably, type SharedPublishBody } from "../../../../server/gifts/shared-publication";

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
    const expiresAt = new Date(now.getTime() + 15 * 60_000).toISOString();
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
    const coverVerified = payload.cover
      ? (async () => {
          const metadata = await store.getObjectMetadata(payload.cover!.objectKey);
          return metadata?.contentType === payload.cover!.contentType && metadata.byteSize === payload.cover!.byteSize;
        })()
      : Promise.resolve(true);
    if (!verified.every(Boolean) || !(await coverVerified)) throw new ApiError(409, "gift_upload_incomplete", "All photos must finish uploading before publishing");
    const promoted = await promoteSharedPublicationDurably({ store, db, giftId: id, sessionId: publicationId, ownerEmail: email, payload, now });
    const result = await completeGiftPublishSessionResult(db, { sessionId: publicationId, ownerEmail: email, now, payload });
    if (result.status !== "success") { await store.deleteObjects(promoted); if (result.status === "conflict") throw new ApiError(409, "gift_album_version_conflict", "The shared album changed after this edit began"); throw new ApiError(409, "gift_publication_unavailable", "This publication has expired or was already submitted"); }
    scheduleOpportunisticGiftMaintenance();
    return Response.json({ albumId: result.albumId }, { status: 201 });
  } catch (error) { return errorResponse(error instanceof GiftAlbumVersionConflictError || error instanceof GiftPublicationUnavailableError ? new ApiError(409, error.code, error.message) : error); }
}
