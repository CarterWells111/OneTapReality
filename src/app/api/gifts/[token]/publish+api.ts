import { getServerDatabase } from "../../../../server/db/client";
import { completeGiftPublishSession, createGiftPublishSession, getGiftAccessByTokenHash, getGiftPublishPayload, type GiftPublicationPayload } from "../../../../server/gifts/repository";
import { getR2MediaStoreFromEnvironment } from "../../../../server/gifts/r2-media";
import { hashGiftToken, requireGiftSessionEmail } from "../../../../server/gifts/session-auth";
import { ApiError, errorResponse } from "../../../../server/http/errors";
import { requireGiftSharingEnabled } from "../../../../server/gifts/alpha-safety";

type PublishBody = {
  sourceMemoryId?: string;
  title?: string;
  pages?: { position?: number; page?: unknown }[];
  media?: { position?: number; contentType?: string; byteSize?: number }[];
};

async function requireOwner(request: Request, token: string) {
  requireGiftSharingEnabled();
  const db = getServerDatabase();
  const email = await requireGiftSessionEmail(request, db);
  const access = await getGiftAccessByTokenHash(db, await hashGiftToken(token), email);
  if (!access || access.status !== "bound" || access.role !== "owner") throw new ApiError(403, "gift_owner_required", "Only the gift owner can publish an album");
  return { db, email, giftId: access.id };
}

function preparePayload(body: PublishBody, giftId: string, sessionId: string): GiftPublicationPayload {
  if (typeof body.sourceMemoryId !== "string" || !body.sourceMemoryId.trim() || typeof body.title !== "string" || !body.title.trim()) throw new ApiError(400, "validation_failed", "A source album and title are required");
  const pages = body.pages ?? [];
  const media = body.media ?? [];
  if (pages.length > 100 || media.length > 50) throw new ApiError(400, "validation_failed", "This album is too large to publish");
  return {
    sourceMemoryId: body.sourceMemoryId.trim(),
    title: body.title.trim().slice(0, 160),
    pages: pages.map((item, position) => ({ position: item.position ?? position, page: item.page ?? {} })),
    media: media.map((item, position) => {
      const { contentType, byteSize } = item;
      if (!contentType?.startsWith("image/") || !Number.isInteger(byteSize) || byteSize === undefined || byteSize < 1 || byteSize > 25 * 1024 * 1024) throw new ApiError(400, "validation_failed", "Each photo must be an image smaller than 25 MB");
      return { position: item.position ?? position, contentType, byteSize, objectKey: `gifts/${giftId}/${sessionId}/${crypto.randomUUID()}` };
    }),
  };
}

export async function POST(request: Request, { token }: { token: string }): Promise<Response> {
  try {
    const store = getR2MediaStoreFromEnvironment();
    if (!store) throw new ApiError(503, "gift_media_unavailable", "Gift media storage is not configured");
    const { db, email, giftId } = await requireOwner(request, token);
    const sessionId = crypto.randomUUID();
    const now = new Date();
    const payload = preparePayload(await request.json() as PublishBody, giftId, sessionId);
    await createGiftPublishSession(db, { id: sessionId, giftId, ownerEmail: email, payload, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString() });
    const uploads = await Promise.all(payload.media.map(async (media) => ({ position: media.position, objectKey: media.objectKey, uploadUrl: await store.createUploadUrl(media) })));
    return Response.json({ publicationId: sessionId, uploads, expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString() }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request, { token }: { token: string }): Promise<Response> {
  try {
    const { publicationId } = await request.json() as { publicationId?: string };
    if (typeof publicationId !== "string") throw new ApiError(400, "validation_failed", "A publication id is required");
    const store = getR2MediaStoreFromEnvironment();
    if (!store) throw new ApiError(503, "gift_media_unavailable", "Gift media storage is not configured");
    const { db, email } = await requireOwner(request, token);
    const now = new Date().toISOString();
    const payload = await getGiftPublishPayload(db, publicationId, email, now);
    if (!payload) throw new ApiError(409, "gift_publication_unavailable", "This publication has expired or was already submitted");
    const uploaded = await Promise.all(payload.media.map(async (media) => {
      const metadata = await store.getObjectMetadata(media.objectKey);
      return metadata?.contentType === media.contentType && metadata.byteSize === media.byteSize;
    }));
    if (!uploaded.every(Boolean)) {
      throw new ApiError(409, "gift_upload_incomplete", "All photos must finish uploading before publishing");
    }
    // The repository owns the metadata, so the client cannot mark a partial upload as published.
    const result = await completeGiftPublishSession(db, { sessionId: publicationId, ownerEmail: email, now });
    if (!result) throw new ApiError(409, "gift_publication_unavailable", "This publication has expired or was already submitted");
    return Response.json({ albumId: result.albumId }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
