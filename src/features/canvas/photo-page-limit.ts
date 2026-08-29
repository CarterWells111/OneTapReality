import type { CanvasElement, CanvasImageElement, StoryPage } from "../../types/memory";
import { createPhotoLayout, MAX_PHOTOS_PER_CANVAS_PAGE } from "./auto-layout";

function imagesInPhotoOrder(page: StoryPage) {
  return (page.layout?.elements ?? [])
    .filter((element): element is CanvasImageElement => element.type === "image")
    .sort((left, right) => left.zIndex - right.zIndex);
}

function uniqueOverflowId(pageId: string, overflowIndex: number, usedIds: Set<string>) {
  const base = `${pageId}:overflow:${overflowIndex}`;
  let id = base;
  let collision = 2;
  while (usedIds.has(id)) {
    id = `${base}:${collision}`;
    collision += 1;
  }
  usedIds.add(id);
  return id;
}

function overflowPage(source: StoryPage, photos: CanvasImageElement[], id: string): StoryPage {
  const generated = createPhotoLayout(photos.map((photo) => photo.uri));
  const elements = generated.elements.map((element, index): CanvasElement => element.type === "image"
    ? {
        ...element,
        id: photos[index].id,
        ...(photos[index].crop ? { crop: photos[index].crop } : {}),
      }
    : element);
  return {
    body: "",
    headline: "",
    id,
    kind: "photo",
    photoUri: photos[0]?.uri,
    position: source.position + 1,
    layout: { aspectRatio: source.layout?.aspectRatio ?? 3 / 4, elements },
  };
}

/**
 * Upgrade old 9–12 photo pages in editor memory only. The caller decides when
 * to persist the returned draft, so merely opening an editor never writes it.
 */
export function splitOverflowPhotoPages(pages: StoryPage[]) {
  if (!pages.some((page) => imagesInPhotoOrder(page).length > MAX_PHOTOS_PER_CANVAS_PAGE)) return pages;
  const usedIds = new Set(pages.map((page) => page.id));
  const result: StoryPage[] = [];
  for (const page of pages) {
    const photos = imagesInPhotoOrder(page);
    if (photos.length <= MAX_PHOTOS_PER_CANVAS_PAGE || !page.layout) {
      result.push(page);
      continue;
    }
    const retainedIds = new Set(photos.slice(0, MAX_PHOTOS_PER_CANVAS_PAGE).map((photo) => photo.id));
    const retainedElements = page.layout.elements.filter((element) => element.type !== "image" || retainedIds.has(element.id));
    const { photoTemplateId: _template, ...layoutWithoutTemplate } = page.layout;
    result.push({
      ...page,
      photoUri: photos[0]?.uri,
      layout: { ...layoutWithoutTemplate, elements: retainedElements },
    });
    const overflow = photos.slice(MAX_PHOTOS_PER_CANVAS_PAGE);
    for (let offset = 0; offset < overflow.length; offset += MAX_PHOTOS_PER_CANVAS_PAGE) {
      const chunk = overflow.slice(offset, offset + MAX_PHOTOS_PER_CANVAS_PAGE);
      result.push(overflowPage(
        page,
        chunk,
        uniqueOverflowId(page.id, (offset / MAX_PHOTOS_PER_CANVAS_PAGE) + 1, usedIds),
      ));
    }
  }
  return result.map((page, position) => ({ ...page, position }));
}
