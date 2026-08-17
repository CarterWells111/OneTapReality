import { getServerDatabase } from "../../../../server/db/client";
import { completeGiftPublishSessionResult, createGiftPublishSession, getGiftAccessByTokenHash, getGiftPublishPayload, GiftAlbumVersionConflictError } from "../../../../server/gifts/repository";
import { getR2MediaStoreFromEnvironment } from "../../../../server/gifts/r2-media";
import { hashGiftToken, requireGiftSessionEmail } from "../../../../server/gifts/session-auth";
import { ApiError, errorResponse } from "../../../../server/http/errors";
import { requireGiftSharingEnabled } from "../../../../server/gifts/alpha-safety";
import { scheduleOpportunisticGiftMaintenance } from "../../../../server/maintenance/opportunistic-gift-maintenance";
import { prepareSharedPublication, promoteSharedPublicationDurably, type SharedPublishBody } from "../../../../server/gifts/shared-publication";

async function requireOwner(request: Request, token: string) {
  requireGiftSharingEnabled();
  const db = getServerDatabase();
  const email = await requireGiftSessionEmail(request, db);
  const access = await getGiftAccessByTokenHash(db, await hashGiftToken(token), email);
  if (!access || access.status !== "bound" || access.role !== "owner") throw new ApiError(403, "gift_owner_required", "Only the gift owner can publish an album");
  return { db, email, giftId: access.id };
}

export async function POST(request: Request, { token }: { token: string }): Promise<Response> {
  try {
    const store = getR2MediaStoreFromEnvironment();
    if (!store) throw new ApiError(503, "gift_media_unavailable", "Gift media storage is not configured");
    const { db, email, giftId } = await requireOwner(request, token);
    const sessionId = crypto.randomUUID();
    const now = new Date();
    const body = await request.json() as SharedPublishBody;
    const { baseVersion, payload } = prepareSharedPublication(body as unknown as SharedPublishBody, giftId, sessionId);
    await createGiftPublishSession(db, { id: sessionId, giftId, ownerEmail: email, baseVersion, payload, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString() });
    const uploads = await Promise.all(payload.media.map(async (media) => ({ position: media.position, objectKey: media.objectKey, uploadUrl: await store.createUploadUrl(media) })));
    const coverUpload = payload.cover ? { uploadUrl: await store.createUploadUrl(payload.cover) } : null;
    scheduleOpportunisticGiftMaintenance();
    return Response.json({ publicationId: sessionId, uploads, coverUpload, expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString() }, { status: 201 });
  } catch (error) { return errorResponse(error instanceof GiftAlbumVersionConflictError ? new ApiError(409, error.code, error.message) : error); }
}

export async function PUT(request: Request, { token }: { token: string }): Promise<Response> {
  try {
    const { publicationId } = await request.json() as { publicationId?: string };
    if (typeof publicationId !== "string") throw new ApiError(400, "validation_failed", "A publication id is required");
    const store = getR2MediaStoreFromEnvironment();
    if (!store) throw new ApiError(503, "gift_media_unavailable", "Gift media storage is not configured");
    const { db, email, giftId } = await requireOwner(request, token);
    const now = new Date().toISOString();
    const payload = await getGiftPublishPayload(db, publicationId, email, now);
    if (!payload) throw new ApiError(409, "gift_publication_unavailable", "This publication has expired or was already submitted");
    const uploaded = await Promise.all(payload.media.map(async (media) => {
      const metadata = await store.getObjectMetadata(media.objectKey);
      return metadata?.contentType === media.contentType && metadata.byteSize === media.byteSize;
    }));
    const coverVerified = payload.cover
      ? (async () => {
          const metadata = await store.getObjectMetadata(payload.cover!.objectKey);
          return metadata?.contentType === payload.cover!.contentType && metadata.byteSize === payload.cover!.byteSize;
        })()
      : Promise.resolve(true);
    if (!uploaded.every(Boolean) || !(await coverVerified)) {
      throw new ApiError(409, "gift_upload_incomplete", "All photos must finish uploading before publishing");
    }
    const promoted = await promoteSharedPublicationDurably({ store, db, giftId, payload, now });
    // The repository owns the metadata, so the client cannot mark a partial upload as published.
    const result = await completeGiftPublishSessionResult(db, { sessionId: publicationId, ownerEmail: email, now, payload });
    if (result.status !== "success") { await store.deleteObjects(promoted); if (result.status === "conflict") throw new ApiError(409, "gift_album_version_conflict", "The shared album changed after this edit began"); throw new ApiError(409, "gift_publication_unavailable", "This publication has expired or was already submitted"); }
    scheduleOpportunisticGiftMaintenance();
    return Response.json({ albumId: result.albumId }, { status: 201 });
  } catch (error) { return errorResponse(error instanceof GiftAlbumVersionConflictError ? new ApiError(409, error.code, error.message) : error); }
}
