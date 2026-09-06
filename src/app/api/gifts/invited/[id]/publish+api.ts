import { requireAuthenticatedAccount } from "../../../../../server/auth/session-auth";
import { getServerDatabase } from "../../../../../server/db/client";
import { requireGiftSharingEnabled } from "../../../../../server/gifts/alpha-safety";
import { getActivatedGiftMemberAccess } from "../../../../../server/gifts/member-access";
import { getR2MediaStoreFromEnvironment } from "../../../../../server/gifts/r2-media";
import { completeGiftPublishSessionResult, createGiftPublishSession, getGiftPublishPayload, GiftAlbumVersionConflictError, GiftPublicationUnavailableError, resolveExistingGiftMedia } from "../../../../../server/gifts/repository";
import { GIFT_PUBLICATION_LIFETIME_MS, prepareSharedPublication, promoteSharedPublicationDurably, selectRefreshableUploads, verifySharedPublication, type RefreshPublishUploadsBody, type SharedPublishBody } from "../../../../../server/gifts/shared-publication";
import { ApiError, errorResponse } from "../../../../../server/http/errors";

async function requireEditor(request: Request, giftId: string) {
  requireGiftSharingEnabled();
  const db = getServerDatabase();
  const account = await requireAuthenticatedAccount(request, db);
  const access = await getActivatedGiftMemberAccess(db, { giftId, userId: account.id, email: account.email, allowedRoles: ["editor"] });
  if (!access) throw new ApiError(403, "gift_editor_required", "Activated editor access is required");
  return { db, account, access };
}

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const store = getR2MediaStoreFromEnvironment(); if (!store) throw new ApiError(503, "gift_media_unavailable", "Gift media storage is not configured");
    const { db, account, access } = await requireEditor(request, id);
    const publicationId = crypto.randomUUID(); const now = new Date();
    const { baseVersion, payload, existingMedia } = prepareSharedPublication(await request.json() as SharedPublishBody, id, publicationId, { allowExistingMedia: true });
    const newMedia = [...payload.media];
    const resolved = await resolveExistingGiftMedia(db, id, baseVersion, existingMedia);
    if (!resolved) throw new ApiError(400, "gift_media_reference_invalid", "Existing media must belong to the current shared album");
    payload.media.push(...resolved);
    const expiresAt = new Date(now.getTime() + GIFT_PUBLICATION_LIFETIME_MS).toISOString();
    await createGiftPublishSession(db, { id: publicationId, giftId: id, ownerEmail: account.email, memberId: (access as { memberId?: string }).memberId, actorUserId: account.id, baseVersion, payload, createdAt: now.toISOString(), expiresAt });
    const uploads = await Promise.all(newMedia.map(async media => ({ position: media.position, objectKey: media.objectKey, uploadUrl: await store.createUploadUrl(media) })));
    return Response.json({ publicationId, uploads, coverUpload: payload.cover ? { uploadUrl: await store.createUploadUrl(payload.cover) } : null, expiresAt }, { status: 201 });
  } catch (error) { return errorResponse(error instanceof GiftAlbumVersionConflictError || error instanceof GiftPublicationUnavailableError ? new ApiError(409, error.code, error.message) : error); }
}

export async function PUT(request: Request, { id }: { id: string }) {
  try {
    const store = getR2MediaStoreFromEnvironment(); if (!store) throw new ApiError(503, "gift_media_unavailable", "Gift media storage is not configured");
    const { db, account } = await requireEditor(request, id);
    const { publicationId } = await request.json() as { publicationId?: string }; if (typeof publicationId !== "string") throw new ApiError(400, "validation_failed", "A publication id is required");
    const now = new Date().toISOString(); const payload = await getGiftPublishPayload(db, publicationId, id, account.email, now);
    if (!payload) throw new ApiError(409, "gift_publication_unavailable", "This publication has expired or was already submitted");
    await verifySharedPublication(store, payload);
    const promoted = await promoteSharedPublicationDurably({ store, db, giftId: id, sessionId: publicationId, ownerEmail: account.email, payload, now });
    const result = await completeGiftPublishSessionResult(db, { sessionId: publicationId, ownerEmail: account.email, now, payload });
    if (result.status !== "success") { await store.deleteObjects(promoted); if (result.status === "conflict") throw new ApiError(409, "gift_album_version_conflict", "The shared album changed after this edit began"); throw new ApiError(409, "gift_publication_unavailable", "Editor access was revoked or the publication expired"); }
    return Response.json({ albumId: result.albumId }, { status: 201 });
  } catch (error) { return errorResponse(error instanceof GiftAlbumVersionConflictError || error instanceof GiftPublicationUnavailableError ? new ApiError(409, error.code, error.message) : error); }
}

export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    const { db, account } = await requireEditor(request, id);
    const body = await request.json() as RefreshPublishUploadsBody;
    if (typeof body.publicationId !== "string") throw new ApiError(400, "validation_failed", "A publication id is required");
    const payload = await getGiftPublishPayload(db, body.publicationId, id, account.email, new Date().toISOString());
    if (!payload) throw new ApiError(409, "gift_publication_unavailable", "This publication has expired or was already submitted");
    const selected = selectRefreshableUploads(body, payload);
    const store = getR2MediaStoreFromEnvironment();
    if (!store) throw new ApiError(503, "gift_media_unavailable", "Gift media storage is not configured");
    const uploads = await Promise.all(selected.media.map(async media => ({ position: media.position, uploadUrl: await store.createUploadUrl(media) })));
    const coverUpload = selected.cover ? { uploadUrl: await store.createUploadUrl(selected.cover) } : null;
    return Response.json({ uploads, coverUpload });
  } catch (error) { return errorResponse(error); }
}
