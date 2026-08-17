import type { InvitedGiftAlbum } from "../../services/backend/api-client";
import type { CanvasElement, CanvasLayout, StoryPage } from "../../types/memory";

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
    ...(typeof value.mediaId === "string" ? { mediaId: value.mediaId } : {}),
    ...(typeof value.mediaRef === "string" ? { mediaRef: value.mediaRef } : {}),
    ...(isFiniteNumber(value.photoSlot) ? { photoSlot: value.photoSlot } : {}),
    ...(isFiniteNumber(value.mediaPosition) ? { mediaPosition: value.mediaPosition } : {}),
  };
  if (value.type === "text" && typeof value.text === "string" && typeof value.fontStyle === "string"
    && typeof value.color === "string" && isFiniteNumber(value.fontSize)) {
    return { ...base, type: "text", text: value.text, fontStyle: value.fontStyle, color: value.color, fontSize: value.fontSize };
  }
  if (value.type === "sticker" && typeof value.stickerId === "string") return { ...base, type: "sticker", stickerId: value.stickerId };
  if (value.type === "frame" && typeof value.frameId === "string") return { ...base, type: "frame", frameId: value.frameId };
  return null;
}

function parseLayout(value: unknown): (Omit<CanvasLayout, "elements"> & { elements: (CanvasElement | SnapshotImageElement)[] }) | undefined {
  if (!isRecord(value) || !isFiniteNumber(value.aspectRatio) || value.aspectRatio <= 0 || !Array.isArray(value.elements)) return undefined;
  return {
    aspectRatio: value.aspectRatio,
    ...(typeof value.backgroundId === "string" ? { backgroundId: value.backgroundId } : {}),
    ...(typeof value.coverColor === "string" ? { coverColor: value.coverColor } : {}),
    ...(typeof value.coverImage === "string" ? { coverImage: value.coverImage } : {}),
    elements: value.elements.map(parseElement).filter((element): element is CanvasElement | SnapshotImageElement => element !== null),
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

  const resolveStableUri = (value: string | undefined) => {
    if (!value) return value;
    if (value.startsWith("shared-media:")) return mediaById.get(value.slice("shared-media:".length))?.readUrl;
    if (value.startsWith("shared-position:")) {
      const position = Number(value.slice("shared-position:".length));
      return Number.isInteger(position) ? mediaByPosition.get(position)?.readUrl : undefined;
    }
    return value;
  };

  return [...album.pages].sort((left, right) => left.position - right.position).map(({ position, page }) => {
    const raw = isRecord(page) ? page : {};
    const headline = typeof raw.headline === "string" ? raw.headline : "";
    const body = typeof raw.body === "string" ? raw.body : "";
    const kind = raw.kind === "cover" || raw.kind === "closing" ? raw.kind : "photo";
    const rawLayout = parseLayout(raw.layout);

    const { coverImage: rawLayoutCoverImage, ...layoutWithoutCover } = rawLayout ?? { elements: [], aspectRatio: 0.75 };
    const layout = rawLayout ? {
      ...layoutWithoutCover,
      ...(resolveStableUri(rawLayoutCoverImage) ? { coverImage: resolveStableUri(rawLayoutCoverImage) } : {}),
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

    const legacyMedia = layout ? undefined : takeMedia();
    return {
      id: typeof raw.id === "string" ? raw.id : `shared-${position}`,
      position: typeof raw.position === "number" ? raw.position : position,
      kind,
      headline,
      body,
      ...(layout ? { layout } : {}),
      ...(legacyMedia ? { photoUri: legacyMedia.readUrl } : {}),
      ...(typeof raw.coverColor === "string" ? { coverColor: raw.coverColor } : {}),
      ...(typeof raw.coverImage === "string" && resolveStableUri(raw.coverImage) ? { coverImage: resolveStableUri(raw.coverImage) } : {}),
    };
  });
}
