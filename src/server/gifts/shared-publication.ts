import type { PrivateMediaStore } from "./r2-media";
import type { GiftPublicationPayload } from "./repository";
import { reserveGiftPublicationPromotion } from "./repository";
import type { BackendDatabase } from "../db/client";
import { ApiError } from "../http/errors";

export type SharedPublishBody = { baseVersion?: number; sourceMemoryId?: string; title?: string; travelDate?: string | null; pages?: { position?: number; page?: unknown }[]; media?: ({ position?: number; mediaId: string } | { position?: number; contentType: string; byteSize: number })[]; cover?: { contentType?: string; byteSize?: number } | null };

function normalizeSharedTravelDate(travelDate: string | null | undefined): string | null {
  if (travelDate === undefined || travelDate === null) return null;
  if (typeof travelDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(travelDate)) throw new ApiError(400, "validation_failed", "Travel date must be a valid ISO date");
  const [year, month, day] = travelDate.split("-").map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new ApiError(400, "validation_failed", "Travel date must be a valid ISO date");
  return travelDate;
}

export function prepareSharedPublication(body: SharedPublishBody, giftId: string, sessionId: string, options: { allowExistingMedia?: boolean } = {}) {
  if (!body || typeof body !== "object" || (body.pages !== undefined && !Array.isArray(body.pages)) || (body.media !== undefined && !Array.isArray(body.media))) throw new ApiError(400, "validation_failed", "Pages and media must be arrays");
  if (!Number.isInteger(body.baseVersion) || body.baseVersion! < 0) throw new ApiError(400, "validation_failed", "A non-negative baseVersion is required");
  if (typeof body.sourceMemoryId !== "string" || !body.sourceMemoryId.trim() || typeof body.title !== "string" || !body.title.trim()) throw new ApiError(400, "validation_failed", "A source album and title are required");
  const pages = body.pages ?? []; const media = body.media ?? []; const cover = body.cover ?? null;
  if (pages.length > 100 || media.length > 50) throw new ApiError(400, "validation_failed", "This album is too large to publish");
  const validImage = (item: { contentType?: string; byteSize?: number }) => item.contentType?.startsWith("image/") && Number.isInteger(item.byteSize) && item.byteSize! > 0 && item.byteSize! <= 25 * 1024 * 1024;
  if (pages.some(item => !item || typeof item !== "object") || media.some(item => !item || typeof item !== "object")) throw new ApiError(400, "validation_failed", "Pages and media entries must be objects");
  const positions = (items: { position?: number }[]) => items.map((item, index) => item.position ?? index);
  const pagePositions = positions(pages); const mediaPositions = positions(media);
  if ([...pagePositions, ...mediaPositions].some(position => !Number.isInteger(position) || position < 0) || new Set(pagePositions).size !== pagePositions.length || new Set(mediaPositions).size !== mediaPositions.length) throw new ApiError(400, "validation_failed", "Positions must be unique non-negative integers");
  if (media.some(item => "mediaId" in item ? typeof item.mediaId !== "string" || !item.mediaId.trim() || Object.keys(item).some(key => !["position", "mediaId"].includes(key)) : !validImage(item))) throw new ApiError(400, "validation_failed", "Media must be an existing mediaId or a valid new image");
  if (!options.allowExistingMedia && media.some(item => "mediaId" in item)) throw new ApiError(400, "validation_failed", "Existing media references are not supported for this publication route");
  if (cover && !validImage(cover)) throw new ApiError(400, "validation_failed", "The cover must be an image smaller than 25 MB");
  const existingMedia = media.flatMap((item, position) => "mediaId" in item ? [{ position: item.position ?? position, mediaId: item.mediaId }] : []);
  const payload: GiftPublicationPayload = {
    sourceMemoryId: body.sourceMemoryId.trim(), title: body.title.trim().slice(0, 160),
    travelDate: normalizeSharedTravelDate(body.travelDate),
    pages: pages.map((item, position) => ({ position: item.position ?? position, page: item.page ?? {} })),
    media: media.flatMap((item, position) => { if ("mediaId" in item) return []; if (!validImage(item)) throw new ApiError(400, "validation_failed", "Each photo must be an image smaller than 25 MB"); return [{ position: item.position ?? position, contentType: item.contentType, byteSize: item.byteSize, objectKey: `gifts/${giftId}/${sessionId}/temp/${crypto.randomUUID()}`, source: "upload" as const }]; }),
    cover: cover ? { contentType: cover.contentType!, byteSize: cover.byteSize!, objectKey: `gifts/${giftId}/${sessionId}/temp/cover` } : null,
  };
  return { baseVersion: body.baseVersion!, payload, existingMedia };
}

export async function verifySharedPublication(store: PrivateMediaStore, payload: GiftPublicationPayload) {
  const items = [...payload.media, ...(payload.cover ? [payload.cover] : [])];
  const verified = await Promise.all(items.map(async item => { const metadata = await store.getObjectMetadata(item.objectKey); return metadata?.contentType === item.contentType && metadata.byteSize === item.byteSize; }));
  if (!verified.every(Boolean)) throw new ApiError(409, "gift_upload_incomplete", "All photos must finish uploading before publishing");
}

type SharedPublicationPromotionPlan = {
  media: { item: GiftPublicationPayload["media"][number]; source: string; final: string }[];
  cover: { item: NonNullable<GiftPublicationPayload["cover"]>; source: string; final: string } | null;
  finalObjectKeys: string[];
};

function planSharedPublicationPromotion(payload: GiftPublicationPayload): SharedPublicationPromotionPlan {
  const attemptId = crypto.randomUUID();
  const media = payload.media.filter(item => item.source !== "existing").map(item => ({
    item, source: item.objectKey, final: item.objectKey.replace("/temp/", `/final/${attemptId}/`),
  }));
  const cover = payload.cover ? {
    item: payload.cover, source: payload.cover.objectKey, final: payload.cover.objectKey.replace("/temp/", `/final/${attemptId}/`),
  } : null;
  return { media, cover, finalObjectKeys: [...media.map(item => item.final), ...(cover ? [cover.final] : [])] };
}

async function executeSharedPublicationPromotion(store: PrivateMediaStore, plan: SharedPublicationPromotionPlan): Promise<string[]> {
  try {
    for (const media of plan.media) {
      await store.copyObject(media.source, media.final);
      const metadata = await store.getObjectMetadata(media.final);
      if (metadata?.contentType !== media.item.contentType || metadata.byteSize !== media.item.byteSize) throw new ApiError(409, "gift_upload_incomplete", "Promoted photo metadata changed before publication");
    }
    if (plan.cover) {
      await store.copyObject(plan.cover.source, plan.cover.final);
      const metadata = await store.getObjectMetadata(plan.cover.final);
      if (metadata?.contentType !== plan.cover.item.contentType || metadata.byteSize !== plan.cover.item.byteSize) throw new ApiError(409, "gift_upload_incomplete", "Promoted cover metadata changed before publication");
    }
    for (const media of plan.media) media.item.objectKey = media.final;
    if (plan.cover) plan.cover.item.objectKey = plan.cover.final;
    return plan.finalObjectKeys;
  } catch (error) {
    try { await store.deleteObjects(plan.finalObjectKeys); } catch { /* durable maintenance can retry planned objects */ }
    if (typeof error === "object" && error !== null) Object.assign(error, { attemptedFinalObjectKeys: [...plan.finalObjectKeys] });
    throw error;
  }
}

export async function promoteSharedPublication(store: PrivateMediaStore, payload: GiftPublicationPayload) {
  return executeSharedPublicationPromotion(store, planSharedPublicationPromotion(payload));
}

export function getAttemptedFinalObjectKeys(error: unknown): string[] {
  if (typeof error !== "object" || error === null || !("attemptedFinalObjectKeys" in error)) return [];
  const keys = (error as { attemptedFinalObjectKeys?: unknown }).attemptedFinalObjectKeys;
  return Array.isArray(keys) && keys.every(key => typeof key === "string") ? keys : [];
}

export async function promoteSharedPublicationDurably(input: {
  store: PrivateMediaStore;
  db: BackendDatabase;
  giftId: string;
  sessionId: string;
  ownerEmail: string;
  payload: GiftPublicationPayload;
  now: string;
}): Promise<string[]> {
  const plan = planSharedPublicationPromotion(input.payload);
  await reserveGiftPublicationPromotion(input.db, {
    giftId: input.giftId,
    sessionId: input.sessionId,
    ownerEmail: input.ownerEmail,
    objectKeys: plan.finalObjectKeys,
    now: input.now,
  });
  return executeSharedPublicationPromotion(input.store, plan);
}
