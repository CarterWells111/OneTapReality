import { createPhotoLayout, MAX_PHOTOS_PER_CANVAS_PAGE } from "./auto-layout";
import { createLegacyLayout, normalizeLayout } from "./canvas-layout";
import { resolvePhotoTemplate } from "./photo-templates";
import { bodyFontFamily } from "../typography/fonts";
import type { CanvasBackgroundId, CanvasElement, CanvasFrameId, CanvasImageElement, CanvasLayout, CanvasStickerId, PhotoTemplateId, StoryPage } from "../../types/memory";

export type CanvasElementPatch = {
  color?: string;
  fontSize?: number;
  fontStyle?: string;
  height?: number;
  rotation?: number;
  text?: string;
  uri?: string;
  width?: number;
  x?: number;
  y?: number;
  zIndex?: number;
};

const normalizePositions = (pages: StoryPage[]) => pages.map((page, position) => ({ ...page, position }));

const withLayout = (page: StoryPage): StoryPage => ({
  ...page,
  layout: normalizeLayout(page.layout ?? createLegacyLayout(page)),
});

function updatePage(pages: StoryPage[], pageId: string, update: (page: StoryPage) => StoryPage) {
  return pages.map((page) => (page.id === pageId ? update(withLayout(page)) : withLayout(page)));
}

function maxLayer(elements: CanvasElement[]) {
  return Math.max(0, ...elements.map((element) => element.zIndex));
}

export type LayoutMetaMode = "preserve" | "clear" | PhotoTemplateId;

/** Preserve all persisted layout metadata with explicit template intent. */
export function preserveLayoutMeta(previous: CanvasLayout, elements: CanvasElement[], templateMode: LayoutMetaMode): CanvasLayout {
  const { photoTemplateId: _previousTemplate, elements: _previousElements, ...metadata } = previous;
  const templateId = templateMode === "preserve"
    ? resolvePhotoTemplate(previous.photoTemplateId)?.id
    : templateMode === "clear"
      ? undefined
      : resolvePhotoTemplate(templateMode)?.id;
  return {
    ...metadata,
    aspectRatio: 0.75 as const,
    ...(templateId ? { photoTemplateId: templateId } : {}),
    elements,
  };
}

export function canvasPages(pages: StoryPage[]) {
  return normalizePositions(pages.map(withLayout));
}

export function pageImageUris(page: StoryPage) {
  return (page.layout ?? createLegacyLayout(page)).elements
    .filter((element) => element.type === "image")
    .map((element) => element.uri);
}

export function toggleCanvasPhotoSelection(selectedPhotoUris: string[], uri: string) {
  if (selectedPhotoUris.includes(uri)) {
    return selectedPhotoUris.filter((candidate) => candidate !== uri);
  }
  return selectedPhotoUris.length >= MAX_PHOTOS_PER_CANVAS_PAGE
    ? selectedPhotoUris
    : [...selectedPhotoUris, uri];
}

export function addCanvasPage(pages: StoryPage[], photoUris: string[], id: string) {
  const photoUri = photoUris[0];
  const page: StoryPage = {
    id,
    position: pages.length,
    kind: "photo",
    headline: "新的回忆",
    body: "点击文字，写下这一刻。",
    ...(photoUri ? { photoUri } : {}),
  };
  const legacy = createLegacyLayout(page);
  const photoLayout = photoUris.length > 0 ? createPhotoLayout(photoUris) : { aspectRatio: 0.75 as const, elements: [] };
  const textElements = legacy.elements
    .filter((element) => element.type === "text")
    .map((element, index) => ({ ...element, zIndex: photoLayout.elements.length + index + 1 }));
  return normalizePositions([
    ...pages.map(withLayout),
    { ...page, layout: { aspectRatio: 1, elements: [...photoLayout.elements, ...textElements] } },
  ]);
}

export function deleteCanvasPage(pages: StoryPage[], pageId: string) {
  if (pages.length <= 1) {
    return canvasPages(pages);
  }
  return normalizePositions(pages.filter((page) => page.id !== pageId).map(withLayout));
}

export function reorderCanvasPages(pages: StoryPage[], fromIndex: number, toIndex: number) {
  const next = canvasPages(pages);
  if (
    fromIndex < 0 || fromIndex >= next.length ||
    toIndex < 0 || toIndex >= next.length ||
    fromIndex === toIndex
  ) {
    return next;
  }
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return normalizePositions(next);
}

export function deleteCanvasPages(pages: StoryPage[], ids: string[]) {
  const removal = new Set(ids);
  const remaining = pages.filter((page) => !removal.has(page.id));
  if (remaining.length === 0) {
    return canvasPages(pages);
  }
  return normalizePositions(remaining.map(withLayout));
}

export function moveCanvasPage(pages: StoryPage[], pageId: string, direction: "forward" | "backward") {
  const next = canvasPages(pages);
  const index = next.findIndex((page) => page.id === pageId);
  const target = direction === "forward" ? index + 1 : index - 1;
  if (index < 0 || target < 0 || target >= next.length) {
    return next;
  }
  [next[index], next[target]] = [next[target], next[index]];
  return normalizePositions(next);
}

export function addImageToPage(pages: StoryPage[], pageId: string, id: string, uri: string) {
  return updatePage(pages, pageId, (page) => {
    if (page.layout!.elements.filter((element) => element.type === "image").length >= MAX_PHOTOS_PER_CANVAS_PAGE) return page;
    return {
      ...page,
      layout: preserveLayoutMeta(page.layout!, [
        ...page.layout!.elements,
        {
          id,
          type: "image",
          uri,
          x: 0.1,
          y: 0.1,
          width: 0.8,
          height: 0.8,
          rotation: 0,
          zIndex: maxLayer(page.layout!.elements) + 1,
        },
      ], "clear"),
    };
  });
}

export function addTextToPage(pages: StoryPage[], pageId: string, id: string) {
  return updatePage(pages, pageId, (page) => ({
    ...page,
    layout: preserveLayoutMeta(page.layout!, [
        ...page.layout!.elements,
        {
          id,
          type: "text",
          text: "点击编辑文字",
          fontStyle: bodyFontFamily,
          color: "#1C2C28",
          fontSize: 18,
          x: 0.12,
          y: 0.45,
          width: 0.72,
          height: 0.12,
          rotation: 0,
          zIndex: maxLayer(page.layout!.elements) + 1,
        },
      ], "preserve"),
  }));
}

export function addStickerToPage(pages: StoryPage[], pageId: string, id: string, stickerId: CanvasStickerId) {
  return updatePage(pages, pageId, (page) => ({
    ...page,
    layout: preserveLayoutMeta(page.layout!, [
        ...page.layout!.elements,
        {
          id,
          type: "sticker",
          stickerId,
          x: 0.72,
          y: 0.78,
          width: 0.2,
          height: 0.2,
          rotation: 0,
          zIndex: maxLayer(page.layout!.elements) + 1,
        },
      ], "preserve"),
  }));
}

export function addFrameToPage(pages: StoryPage[], pageId: string, id: string, frameId: CanvasFrameId) {
  return updatePage(pages, pageId, (page) => ({
    ...page,
    layout: preserveLayoutMeta(page.layout!, [
        ...page.layout!.elements,
        {
          id,
          type: "frame",
          frameId,
          x: 0.04,
          y: 0.04,
          width: 0.92,
          height: 0.92,
          rotation: 0,
          zIndex: maxLayer(page.layout!.elements) + 1,
        },
      ], "preserve"),
  }));
}

export function setCanvasBackground(
  pages: StoryPage[],
  pageId: string,
  backgroundId: CanvasBackgroundId | undefined,
) {
  return updatePage(pages, pageId, (page) => ({
    ...page,
    layout: preserveLayoutMeta({ ...page.layout!, backgroundId }, page.layout!.elements, "preserve"),
  }));
}

export function setCanvasCoverColor(
  pages: StoryPage[],
  pageId: string,
  coverColor: string | undefined,
) {
  return updatePage(pages, pageId, (page) => ({
    ...page,
    coverColor,
    layout: preserveLayoutMeta({ ...page.layout!, coverColor }, page.layout!.elements, "preserve"),
  }));
}

export function setCanvasCoverImage(
  pages: StoryPage[],
  pageId: string,
  coverImage: string | undefined,
) {
  return updatePage(pages, pageId, (page) => ({
    ...page,
    coverImage,
    layout: preserveLayoutMeta({ ...page.layout!, coverImage }, page.layout!.elements, "preserve"),
  }));
}

export function updateCanvasElement(
  pages: StoryPage[],
  pageId: string,
  elementId: string,
  patch: CanvasElementPatch,
) {
  return updatePage(pages, pageId, (page) => {
    const current = page.layout!.elements.find((element) => element.id === elementId);
    const nextElements = page.layout!.elements.map((element) =>
      element.id === elementId ? ({ ...element, ...patch } as CanvasElement) : element,
    );
    const next = nextElements.find((element) => element.id === elementId);
    const imageChanged = current?.type === "image" && next?.type === "image" && (
      current.uri !== next.uri ||
      current.x !== next.x ||
      current.y !== next.y ||
      current.width !== next.width ||
      current.height !== next.height ||
      current.rotation !== next.rotation
    );
    return {
      ...page,
      layout: preserveLayoutMeta(page.layout!, nextElements, imageChanged ? "clear" : "preserve"),
    };
  });
}

export function duplicateCanvasElement(pages: StoryPage[], pageId: string, elementId: string, copyId: string) {
  return updatePage(pages, pageId, (page) => {
    const source = page.layout!.elements.find((element) => element.id === elementId);
    if (!source) {
      return page;
    }
    if (source.type === "image" && page.layout!.elements.filter((element) => element.type === "image").length >= MAX_PHOTOS_PER_CANVAS_PAGE) {
      return page;
    }
    return {
      ...page,
      layout: preserveLayoutMeta(page.layout!, [
          ...page.layout!.elements,
          {
            ...source,
            id: copyId,
            x: Math.min(source.x + 0.05, 1 - source.width),
            y: Math.min(source.y + 0.05, 1 - source.height),
            zIndex: maxLayer(page.layout!.elements) + 1,
          },
        ], source.type === "image" ? "clear" : "preserve"),
    };
  });
}

export function changeCanvasElementLayer(
  pages: StoryPage[],
  pageId: string,
  elementId: string,
  direction: "forward" | "backward",
) {
  return updatePage(pages, pageId, (page) => {
    const elements = [...page.layout!.elements].sort((left, right) => left.zIndex - right.zIndex);
    const index = elements.findIndex((element) => element.id === elementId);
    const target = direction === "forward" ? index + 1 : index - 1;
    if (index < 0 || target < 0 || target >= elements.length) {
      return page;
    }
    const currentLayer = elements[index].zIndex;
    elements[index] = { ...elements[index], zIndex: elements[target].zIndex };
    elements[target] = { ...elements[target], zIndex: currentLayer };
    return { ...page, layout: preserveLayoutMeta(page.layout!, elements, "preserve") };
  });
}

export function deleteCanvasElement(pages: StoryPage[], pageId: string, elementId: string) {
  return updatePage(pages, pageId, (page) => {
    const deleted = page.layout!.elements.find((element) => element.id === elementId);
    return {
      ...page,
      layout: preserveLayoutMeta(
        page.layout!,
        page.layout!.elements.filter((element) => element.id !== elementId),
        deleted?.type === "image" ? "clear" : "preserve",
      ),
    };
  });
}

function orderedImages(elements: CanvasElement[]) {
  const images: { element: CanvasImageElement; index: number }[] = [];
  elements.forEach((element, index) => {
    if (element.type === "image") images.push({ element, index });
  });
  return images.sort((left, right) => left.element.zIndex - right.element.zIndex || left.index - right.index);
}

export function applyPhotoTemplateToPage(pages: StoryPage[], pageId: string, templateId: string) {
  const page = pages.find((candidate) => candidate.id === pageId);
  const template = resolvePhotoTemplate(templateId);
  if (!page || !template) return pages;
  const currentPage = withLayout(page);
  const images = orderedImages(currentPage.layout!.elements);
  if (images.length !== template.photoCount) return pages;

  const slotById = new Map(images.map(({ element }, index) => [element.id, template.slots[index]]));
  return updatePage(pages, pageId, (nextPage) => ({
    ...nextPage,
    layout: preserveLayoutMeta(
      nextPage.layout!,
      nextPage.layout!.elements.map((element) => {
        const slot = element.type === "image" ? slotById.get(element.id) : undefined;
        return slot ? { ...element, ...slot } : element;
      }),
      template.id,
    ),
  }));
}

export function replacePagePhotos(
  pages: StoryPage[],
  pageId: string,
  photos: { id: string; uri: string }[],
  templateId?: string,
) {
  if (!pages.some((page) => page.id === pageId)) return pages;
  return updatePage(pages, pageId, (page) => {
    const limitedPhotos = photos.slice(0, MAX_PHOTOS_PER_CANVAS_PAGE);
    const template = resolvePhotoTemplate(templateId);
    const useTemplate = template !== undefined && template.photoCount === limitedPhotos.length;
    const generated: CanvasImageElement[] = [];
    if (useTemplate && template) {
      limitedPhotos.forEach((photo, index) => generated.push({
        id: photo.id,
        type: "image",
        uri: photo.uri,
        ...template.slots[index],
        zIndex: index + 1,
      }));
    } else {
      createPhotoLayout(limitedPhotos.map((photo) => photo.uri)).elements.forEach((element, index) => {
        if (element.type === "image") generated.push({ ...element, id: limitedPhotos[index].id });
      });
    }

    let imageIndex = 0;
    const elements = page.layout!.elements
      .map((element) => {
        if (element.type !== "image") return element;
        const replacement = generated[imageIndex];
        imageIndex += 1;
        return replacement;
      })
      .filter((element): element is CanvasElement => element !== undefined);
    elements.push(...generated.slice(imageIndex));
    return {
      ...page,
      layout: preserveLayoutMeta(page.layout!, elements, useTemplate ? template.id : "clear"),
    };
  });
}
