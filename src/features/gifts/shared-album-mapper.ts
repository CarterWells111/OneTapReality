import type { InvitedGiftAlbum } from "../../services/backend/api-client";
import type { CanvasElement, CanvasLayout, StoryPage } from "../../types/memory";
import { canvasPages } from "../canvas/editor-pages";
import { normalizePhotoCropState } from "../canvas/photo-crop";
import { resolvePhotoTemplate } from "../canvas/photo-templates";

type SnapshotImageElement = Extract<CanvasElement, { type: "image" }> & {
  mediaId?: string;
  mediaRef?: string;
  photoSlot?: number;
  mediaPosition?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseElement(value: unknown): (CanvasElement | SnapshotImageElement) | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || !isFiniteNumber(value.x)
    || !isFiniteNumber(value.y)
    || !isFiniteNumber(value.width)
    || !isFiniteNumber(value.height)
    || !isFiniteNumber(value.rotation)
    || !isFiniteNumber(value.zIndex)) return null;
  const base = { id: value.id, x: value.x, y: value.y, width: value.width, height: value.height, rotation: value.rotation, zIndex: value.zIndex };
  if (value.type === "image" && typeof value.uri === "string") return {
    ...base,
    type: "image",
    uri: value.uri,
    ...(value.crop !== undefined ? { crop: normalizePhotoCropState(value.crop) } : {}),
    ...(typeof value.mediaId === "string" ? { mediaId: value.mediaId } : {}),
    ...(typeof value.mediaRef === "string" ? { mediaRef: value.mediaRef } : {}),
    ...(isFiniteNumber(value.photoSlot) ? { photoSlot: value.photoSlot } : {}),
    ...(isFiniteNumber(value.mediaPosition) ? { mediaPosition: value.mediaPosition } : {}),
  };
  if (value.type === "text" && typeof value.text === "string" && typeof value.fontStyle === "string"
    && typeof value.color === "string" && isFiniteNumber(value.fontSize)) {
    return { ...base, type: "text", text: value.text, fontStyle: value.fontStyle, color: value.color, fontSize: value.fontSize,
      ...(value.templateCaption === true ? { templateCaption: true as const } : {}) };
  }
  if (value.type === "sticker" && typeof value.stickerId === "string") return { ...base, type: "sticker", stickerId: value.stickerId };
  if (value.type === "frame" && typeof value.frameId === "string") return { ...base, type: "frame", frameId: value.frameId };
  return null;
}

function parseLayout(value: unknown): (Omit<CanvasLayout, "elements"> & { coverMediaPosition?: number; elements: (CanvasElement | SnapshotImageElement)[] }) | undefined {
  if (!isRecord(value) || !isFiniteNumber(value.aspectRatio) || value.aspectRatio <= 0 || !Array.isArray(value.elements)) return undefined;
  const elements = value.elements.map(parseElement).filter((element): element is CanvasElement | SnapshotImageElement => element !== null);
  const template = typeof value.photoTemplateId === "string"
    ? resolvePhotoTemplate(value.photoTemplateId)
    : undefined;
  const photoTemplateId = template?.photoCount === elements.filter((element) => element.type === "image").length
    ? template.id
    : undefined;
  return {
    aspectRatio: value.aspectRatio,
    ...(photoTemplateId ? { photoTemplateId } : {}),
    ...(typeof value.backgroundId === "string" ? { backgroundId: value.backgroundId } : {}),
    ...(typeof value.coverColor === "string" ? { coverColor: value.coverColor } : {}),
    ...(typeof value.coverImage === "string" ? { coverImage: value.coverImage } : {}),
    ...(isFiniteNumber(value.coverMediaPosition) ? { coverMediaPosition: value.coverMediaPosition } : {}),
    ...(value.coverCrop !== undefined ? { coverCrop: normalizePhotoCropState(value.coverCrop) } : {}),
    elements,
  };
}

export function mapSharedAlbumToStoryPages(album: InvitedGiftAlbum): StoryPage[] {
  const media = [...album.media].sort((left, right) => left.position - right.position);
  const mediaById = new Map(media.map((item) => [item.id, item]));
  const mediaByPosition = new Map(media.map((item) => [item.position, item]));
  const consumed = new Set<string>();
  let fallbackIndex = 0;

  const takeMedia = (element?: SnapshotImageElement) => {
    const stableId = element?.mediaId ?? element?.mediaRef;
    const stablePosition = element?.mediaPosition ?? element?.photoSlot;
    const hasStableReference = Boolean(stableId) || typeof stablePosition === "number";
    const stable = (stableId ? mediaById.get(stableId) : undefined)
      ?? (typeof stablePosition === "number" ? mediaByPosition.get(stablePosition) : undefined);
    if (stable) {
      consumed.add(stable.id);
      return stable;
    }
    if (hasStableReference) return undefined;
    while (fallbackIndex < media.length && consumed.has(media[fallbackIndex].id)) fallbackIndex += 1;
    const fallback = media[fallbackIndex];
    if (fallback) {
      consumed.add(fallback.id);
      fallbackIndex += 1;
    }
    return fallback;
  };

  const resolveStableUri = (value: string | undefined, fallbackPosition?: number) => {
    let resolved;
    if (value?.startsWith("shared-media:")) resolved = mediaById.get(value.slice("shared-media:".length));
    else if (value?.startsWith("shared-position:")) {
      const position = Number(value.slice("shared-position:".length));
      resolved = Number.isInteger(position) ? mediaByPosition.get(position) : undefined;
    } else if (typeof fallbackPosition !== "number") return value;
    resolved ??= typeof fallbackPosition === "number" ? mediaByPosition.get(fallbackPosition) : undefined;
    if (resolved) consumed.add(resolved.id);
    return resolved?.readUrl;
  };

  return [...album.pages].sort((left, right) => left.position - right.position).map(({ position, page }) => {
    const raw = isRecord(page) ? page : {};
    const headline = typeof raw.headline === "string" ? raw.headline : "";
    const body = typeof raw.body === "string" ? raw.body : "";
    const kind = raw.kind === "cover" || raw.kind === "closing" ? raw.kind : "photo";
    const rawLayout = parseLayout(raw.layout);
    const rawPhotoUri = typeof raw.photoUri === "string" ? raw.photoUri : undefined;
    const photoMediaPosition = isFiniteNumber(raw.photoMediaPosition) ? raw.photoMediaPosition : undefined;
    const hasStablePhotoReference = rawPhotoUri?.startsWith("shared-media:") || rawPhotoUri?.startsWith("shared-position:") || typeof photoMediaPosition === "number";
    const resolvedPhotoUri = resolveStableUri(rawPhotoUri, photoMediaPosition);
    const coverImage = resolveStableUri(typeof raw.coverImage === "string" ? raw.coverImage : undefined,
      isFiniteNumber(raw.coverMediaPosition) ? raw.coverMediaPosition : undefined);

    const { coverImage: rawLayoutCoverImage, coverMediaPosition: layoutCoverPosition, ...layoutWithoutCover } = rawLayout ?? { elements: [], aspectRatio: 0.75 };
    const layoutCoverImage = resolveStableUri(rawLayoutCoverImage, layoutCoverPosition);
    const layout = rawLayout ? {
      ...layoutWithoutCover,
      ...(layoutCoverImage ? { coverImage: layoutCoverImage } : {}),
      elements: rawLayout.elements.map((element) => {
        if (element.type !== "image") return { ...element };
        const snapshotImage = element as SnapshotImageElement;
        const { mediaId: _mediaId, mediaRef: _mediaRef, photoSlot: _photoSlot, mediaPosition: _mediaPosition, ...image } = snapshotImage;
        const resolved = takeMedia(snapshotImage);
        const hasStableReference = Boolean(snapshotImage.mediaId ?? snapshotImage.mediaRef)
          || typeof (snapshotImage.mediaPosition ?? snapshotImage.photoSlot) === "number";
        return resolved ? { ...image, uri: resolved.readUrl } : { ...image, uri: hasStableReference ? "" : image.uri };
      }),
    } : undefined;

    const legacyMedia = layout
      ? undefined
      : resolvedPhotoUri
        ? { readUrl: resolvedPhotoUri }
        : hasStablePhotoReference
          ? undefined
          : takeMedia();
    return {
      id: typeof raw.id === "string" ? raw.id : `shared-${position}`,
      position: typeof raw.position === "number" ? raw.position : position,
      kind,
      headline,
      body,
      ...(layout ? { layout } : {}),
      ...(hasStablePhotoReference && resolvedPhotoUri ? { photoUri: resolvedPhotoUri } : legacyMedia ? { photoUri: legacyMedia.readUrl } : {}),
      ...(typeof raw.coverColor === "string" ? { coverColor: raw.coverColor } : {}),
      ...(coverImage ? { coverImage } : {}),
    };
  });
}

/**
 * Shared previews preserve the published snapshot as-is, while editing requires
 * the same normalized Canvas shape used by local albums. In particular, older
 * shared snapshots only contain photoUri/headline/body and would otherwise make
 * BookCanvasEditor render nothing because they have no layout.
 */
export function mapSharedAlbumToEditablePages(album: InvitedGiftAlbum): StoryPage[] {
  return canvasPages(mapSharedAlbumToStoryPages(album));
}
