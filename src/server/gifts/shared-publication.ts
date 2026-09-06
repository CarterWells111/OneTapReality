import type { PrivateMediaStore } from "./r2-media";
import type { GiftPublicationPayload } from "./repository";
import { completeGiftPublishSessionResult, getGiftPublishCompletionReceipt, getGiftPublishPayload, reserveGiftPublicationPromotion } from "./repository";
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

export const GIFT_PUBLICATION_LIFETIME_MS = 30 * 60_000;

export type RefreshPublishUploadsBody = {
  publicationId?: string;
  positions?: number[];
  cover?: boolean;
};

export function selectRefreshableUploads(
  body: RefreshPublishUploadsBody,
  payload: GiftPublicationPayload,
): { media: GiftPublicationPayload["media"]; cover: GiftPublicationPayload["cover"] | null } {
  if (!body || typeof body !== "object" || typeof body.publicationId !== "string" || !body.publicationId.trim()) {
    throw new ApiError(400, "validation_failed", "A publication id is required");
  }
  if (body.positions !== undefined && !Array.isArray(body.positions)) {
    throw new ApiError(400, "validation_failed", "Upload positions must be an array");
  }
  if (body.cover !== undefined && typeof body.cover !== "boolean") {
    throw new ApiError(400, "validation_failed", "Cover selection must be a boolean");
  }
  const positions = body.positions ?? [];
  if (positions.some((position) => !Number.isInteger(position) || position < 0)
    || new Set(positions).size !== positions.length) {
    throw new ApiError(400, "validation_failed", "Upload positions must be unique non-negative integers");
  }
  const uploadByPosition = new Map(payload.media
    .filter((item) => item.source !== "existing")
    .map((item) => [item.position, item]));
  const media = positions.map((position) => {
    const item = uploadByPosition.get(position);
    if (!item) throw new ApiError(400, "validation_failed", "Only pending uploaded media can be refreshed");
    return item;
  });
  if (body.cover && !payload.cover) {
    throw new ApiError(400, "validation_failed", "This publication has no uploaded cover");
  }
  return { media, cover: body.cover ? (payload.cover ?? null) : null };
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

type SharedPublicationPromotionItem = {
  item: { objectKey: string; contentType: string; byteSize: number };
  source: string;
  final: string;
};

type SharedPublicationPromotionPlan = {
  media: SharedPublicationPromotionItem[];
  cover: SharedPublicationPromotionItem | null;
  finalObjectKeys: string[];
};

function finalObjectKey(source: string, sessionId: string): string {
  const marker = `/${sessionId}/temp/`;
  if (!source.includes(marker)) {
    throw new ApiError(409, "gift_upload_incomplete", "Uploaded media does not belong to this publication");
  }
  return source.replace(marker, `/${sessionId}/final/`);
}

function planSharedPublicationPromotion(payload: GiftPublicationPayload, sessionId: string): SharedPublicationPromotionPlan {
  const media = payload.media.filter(item => item.source !== "existing").map(item => ({
    item, source: item.objectKey, final: finalObjectKey(item.objectKey, sessionId),
  }));
  const cover = payload.cover ? {
    item: payload.cover, source: payload.cover.objectKey, final: finalObjectKey(payload.cover.objectKey, sessionId),
  } : null;
  return { media, cover, finalObjectKeys: [...media.map(item => item.final), ...(cover ? [cover.final] : [])] };
}

export class GiftPublicationRetryableError extends Error {
  readonly code = "gift_publication_retryable";

  constructor(message = "Gift publication finalization can be retried") {
    super(message);
    this.name = "GiftPublicationRetryableError";
  }
}

const promotionTimeBudgetMs = 120_000;
const promotionCleanupTimeBudgetMs = 5_000;
const promotionConcurrency = 4;
const promotionRetryDelaysMs = [250, 750] as const;

function promotionAbortError(): GiftPublicationRetryableError {
  return new GiftPublicationRetryableError("Gift publication finalization exceeded its safety budget");
}

function throwIfPromotionAborted(signal: AbortSignal): void {
  if (signal.aborted) throw promotionAbortError();
}

async function bestEffortDeletePromotionObjects(store: PrivateMediaStore, objectKeys: string[]): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), promotionCleanupTimeBudgetMs);
  (timeout as unknown as { unref?: () => void }).unref?.();
  const aborted = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener("abort", () => reject(new Error("Promotion cleanup time budget exceeded")), { once: true });
  });
  try {
    await Promise.race([
      store.deleteObjects(objectKeys, { abortSignal: controller.signal }),
      aborted,
    ]);
  } catch {
    // The pre-registered durable cleanup rows remain the source of truth.
  } finally {
    clearTimeout(timeout);
  }
}

function metadataMatches(
  metadata: { contentType: string; byteSize: number } | null,
  item: { contentType: string; byteSize: number },
): boolean {
  return metadata?.contentType === item.contentType && metadata.byteSize === item.byteSize;
}

async function waitForPromotionRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  throwIfPromotionAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    const abort = () => {
      clearTimeout(timeout);
      reject(promotionAbortError());
    };
    signal.addEventListener("abort", abort, { once: true });
    (timeout as unknown as { unref?: () => void }).unref?.();
  });
  throwIfPromotionAborted(signal);
}

async function verifyOrCopyPromotionObject(
  store: PrivateMediaStore,
  promotion: SharedPublicationPromotionItem,
  signal: AbortSignal,
): Promise<void> {
  for (let attempt = 0; attempt <= promotionRetryDelaysMs.length; attempt += 1) {
    try {
      throwIfPromotionAborted(signal);
      const existing = await store.getObjectMetadata(promotion.final);
      throwIfPromotionAborted(signal);
      if (metadataMatches(existing, promotion.item)) return;

      await store.copyObject(promotion.source, promotion.final, { abortSignal: signal });
      throwIfPromotionAborted(signal);
      const copied = await store.getObjectMetadata(promotion.final);
      throwIfPromotionAborted(signal);
      if (!metadataMatches(copied, promotion.item)) {
        throw new ApiError(409, "gift_upload_incomplete", "Promoted media metadata changed before publication");
      }
      return;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (signal.aborted) throw promotionAbortError();
      if (attempt >= promotionRetryDelaysMs.length) throw new GiftPublicationRetryableError();
      await waitForPromotionRetry(promotionRetryDelaysMs[attempt], signal);
    }
  }
}

async function executeSharedPublicationPromotion(store: PrivateMediaStore, plan: SharedPublicationPromotionPlan): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), promotionTimeBudgetMs);
  (timeout as unknown as { unref?: () => void }).unref?.();
  const aborted = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener("abort", () => reject(promotionAbortError()), { once: true });
  });
  const execute = async (): Promise<string[]> => {
    const items = [...plan.media, ...(plan.cover ? [plan.cover] : [])];
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(promotionConcurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;
        await verifyOrCopyPromotionObject(store, item, controller.signal);
      }
    });
    await Promise.all(workers);
    for (const media of plan.media) media.item.objectKey = media.final;
    if (plan.cover) plan.cover.item.objectKey = plan.cover.final;
    return plan.finalObjectKeys;
  };
  try {
    return await Promise.race([execute(), aborted]);
  } catch (error) {
    if (!(error instanceof GiftPublicationRetryableError)) {
      await bestEffortDeletePromotionObjects(store, plan.finalObjectKeys);
    }
    if (typeof error === "object" && error !== null) Object.assign(error, { attemptedFinalObjectKeys: [...plan.finalObjectKeys] });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function inferPublicationId(payload: GiftPublicationPayload): string {
  const source = payload.media.find(item => item.source !== "existing")?.objectKey ?? payload.cover?.objectKey;
  const match = source?.match(/\/([^/]+)\/temp\/[^/]+$/u);
  if (!match) throw new ApiError(409, "gift_upload_incomplete", "Uploaded media does not belong to a publication");
  return match[1];
}

export async function promoteSharedPublication(store: PrivateMediaStore, payload: GiftPublicationPayload, sessionId = inferPublicationId(payload)) {
  return executeSharedPublicationPromotion(store, planSharedPublicationPromotion(payload, sessionId));
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
  const plan = planSharedPublicationPromotion(input.payload, input.sessionId);
  await reserveGiftPublicationPromotion(input.db, {
    giftId: input.giftId,
    sessionId: input.sessionId,
    ownerEmail: input.ownerEmail,
    objectKeys: plan.finalObjectKeys,
    now: input.now,
  });
  return executeSharedPublicationPromotion(input.store, plan);
}

type FinalizeSharedPublicationResult = { albumId: string; version: number };

function logPublicationFinalization(input: {
  count: number;
  durationMs: number;
  outcome: "success" | "retryable" | "conflict" | "invalid" | "internal_error";
  errorCode: string | null;
}): void {
  console.info("gift_publication_finalize", {
    phase: "finalize",
    count: input.count,
    durationMs: input.durationMs,
    outcome: input.outcome,
    errorCode: input.errorCode,
  });
}

export async function finalizeSharedPublication(input: {
  store: PrivateMediaStore | null;
  db: BackendDatabase;
  giftId: string;
  sessionId: string;
  ownerEmail: string;
  now: string;
}): Promise<FinalizeSharedPublicationResult> {
  const startedAt = Date.now();
  let count = 0;
  try {
    const receipt = await getGiftPublishCompletionReceipt(input.db, input.sessionId, input.giftId, input.ownerEmail);
    if (receipt) {
      logPublicationFinalization({ count, durationMs: Date.now() - startedAt, outcome: "success", errorCode: null });
      return receipt;
    }
    if (!input.store) throw new ApiError(503, "gift_media_unavailable", "Gift media storage is not configured");

    const payload = await getGiftPublishPayload(input.db, input.sessionId, input.giftId, input.ownerEmail, input.now);
    if (!payload) throw new ApiError(409, "gift_publication_unavailable", "This publication has expired or was already submitted");
    count = payload.media.length + (payload.cover ? 1 : 0);
    const promoted = await promoteSharedPublicationDurably({ ...input, store: input.store, payload });
    const result = await completeGiftPublishSessionResult(input.db, {
      sessionId: input.sessionId,
      ownerEmail: input.ownerEmail,
      now: input.now,
      payload,
    });
    if (result.status !== "success") {
      await bestEffortDeletePromotionObjects(input.store, promoted);
      if (result.status === "conflict") throw new ApiError(409, "gift_album_version_conflict", "The shared album changed after this edit began");
      throw new ApiError(409, "gift_publication_unavailable", "Publishing access was revoked or the publication expired");
    }
    const response = { albumId: result.albumId, version: result.version };
    logPublicationFinalization({ count, durationMs: Date.now() - startedAt, outcome: "success", errorCode: null });
    return response;
  } catch (error) {
    const mapped = error instanceof GiftPublicationRetryableError
      ? new ApiError(503, error.code, error.message, undefined, { "Retry-After": "2" })
      : error;
    const errorCode = mapped instanceof ApiError ? mapped.code : "internal_error";
    const outcome = errorCode === "gift_publication_retryable"
      ? "retryable"
      : errorCode === "gift_album_version_conflict"
        ? "conflict"
        : mapped instanceof ApiError && mapped.status < 500
          ? "invalid"
          : "internal_error";
    logPublicationFinalization({ count, durationMs: Date.now() - startedAt, outcome, errorCode });
    throw mapped;
  }
}
