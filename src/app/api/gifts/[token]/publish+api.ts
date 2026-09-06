import { getServerDatabase } from "../../../../server/db/client";
import { createGiftPublishSession, getGiftAccessByTokenHash, getGiftPublishPayload, GiftAlbumVersionConflictError, GiftPublicationUnavailableError } from "../../../../server/gifts/repository";
import { getR2MediaStoreFromEnvironment } from "../../../../server/gifts/r2-media";
import { hashGiftToken, requireGiftSessionEmail } from "../../../../server/gifts/session-auth";
import { ApiError, errorResponse } from "../../../../server/http/errors";
import { requireGiftSharingEnabled } from "../../../../server/gifts/alpha-safety";
import { scheduleOpportunisticGiftMaintenance } from "../../../../server/maintenance/opportunistic-gift-maintenance";
import { finalizeSharedPublication, GIFT_PUBLICATION_LIFETIME_MS, prepareSharedPublication, selectRefreshableUploads, type RefreshPublishUploadsBody, type SharedPublishBody } from "../../../../server/gifts/shared-publication";

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
    const expiresAt = new Date(now.getTime() + GIFT_PUBLICATION_LIFETIME_MS).toISOString();
    await createGiftPublishSession(db, { id: sessionId, giftId, ownerEmail: email, baseVersion, payload, createdAt: now.toISOString(), expiresAt });
    const uploads = await Promise.all(payload.media.map(async (media) => ({ position: media.position, objectKey: media.objectKey, uploadUrl: await store.createUploadUrl(media) })));
    const coverUpload = payload.cover ? { uploadUrl: await store.createUploadUrl(payload.cover) } : null;
    scheduleOpportunisticGiftMaintenance();
    return Response.json({ publicationId: sessionId, uploads, coverUpload, expiresAt }, { status: 201 });
  } catch (error) { return errorResponse(error instanceof GiftAlbumVersionConflictError || error instanceof GiftPublicationUnavailableError ? new ApiError(409, error.code, error.message) : error); }
}

export async function PUT(request: Request, { token }: { token: string }): Promise<Response> {
  try {
    const { publicationId } = await request.json() as { publicationId?: string };
    if (typeof publicationId !== "string") throw new ApiError(400, "validation_failed", "A publication id is required");
    const { db, email, giftId } = await requireOwner(request, token);
    const now = new Date().toISOString();
    const result = await finalizeSharedPublication({ store: getR2MediaStoreFromEnvironment(), db, giftId, sessionId: publicationId, ownerEmail: email, now });
    scheduleOpportunisticGiftMaintenance();
    return Response.json(result, { status: 201 });
  } catch (error) { return errorResponse(error instanceof GiftAlbumVersionConflictError || error instanceof GiftPublicationUnavailableError ? new ApiError(409, error.code, error.message) : error); }
}

export async function PATCH(request: Request, { token }: { token: string }): Promise<Response> {
  try {
    const { db, email, giftId } = await requireOwner(request, token);
    const body = await request.json() as RefreshPublishUploadsBody;
    if (typeof body.publicationId !== "string") throw new ApiError(400, "validation_failed", "A publication id is required");
    const payload = await getGiftPublishPayload(db, body.publicationId, giftId, email, new Date().toISOString());
    if (!payload) throw new ApiError(409, "gift_publication_unavailable", "This publication has expired or was already submitted");
    const selected = selectRefreshableUploads(body, payload);
    const store = getR2MediaStoreFromEnvironment();
    if (!store) throw new ApiError(503, "gift_media_unavailable", "Gift media storage is not configured");
    const uploads = await Promise.all(selected.media.map(async (media) => ({ position: media.position, uploadUrl: await store.createUploadUrl(media) })));
    const coverUpload = selected.cover ? { uploadUrl: await store.createUploadUrl(selected.cover) } : null;
    return Response.json({ uploads, coverUpload });
  } catch (error) { return errorResponse(error); }
}
