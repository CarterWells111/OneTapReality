import { createPhotoLayout, MAX_PHOTOS_PER_CANVAS_PAGE } from "./auto-layout";
import { createLegacyLayout } from "./canvas-layout";
import type { CanvasElement, CanvasStickerId, StoryPage } from "../../types/memory";

export type CanvasElementPatch = {
  color?: string;
  fontStyle?: "system" | "avenir" | "georgia";
  height?: number;
  rotation?: number;
  text?: string;
  width?: number;
  x?: number;
  y?: number;
  zIndex?: number;
};

const normalizePositions = (pages: StoryPage[]) => pages.map((page, position) => ({ ...page, position }));

const withLayout = (page: StoryPage): StoryPage => ({
  ...page,
  layout: page.layout ?? createLegacyLayout(page),
});

function updatePage(pages: StoryPage[], pageId: string, update: (page: StoryPage) => StoryPage) {
  return pages.map((page) => (page.id === pageId ? update(withLayout(page)) : withLayout(page)));
}

function maxLayer(elements: CanvasElement[]) {
  return Math.max(0, ...elements.map((element) => element.zIndex));
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
  const photoLayout = photoUris.length > 0 ? createPhotoLayout(photoUris) : { aspectRatio: 1 as const, elements: [] };
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

export function addTextToPage(pages: StoryPage[], pageId: string, id: string) {
  return updatePage(pages, pageId, (page) => ({
    ...page,
    layout: {
      aspectRatio: 1,
      elements: [
        ...page.layout!.elements,
        {
          id,
          type: "text",
          text: "点击编辑文字",
          fontStyle: "avenir",
          color: "#1C2C28",
          x: 0.12,
          y: 0.45,
          width: 0.72,
          height: 0.12,
          rotation: 0,
          zIndex: maxLayer(page.layout!.elements) + 1,
        },
      ],
    },
  }));
}

export function addStickerToPage(pages: StoryPage[], pageId: string, id: string, stickerId: CanvasStickerId) {
  return updatePage(pages, pageId, (page) => ({
    ...page,
    layout: {
      aspectRatio: 1,
      elements: [
        ...page.layout!.elements,
        {
          id,
          type: "sticker",
          stickerId,
          x: 0.72,
          y: 0.78,
          width: 0.14,
          height: 0.14,
          rotation: 0,
          zIndex: maxLayer(page.layout!.elements) + 1,
        },
      ],
    },
  }));
}

export function updateCanvasElement(
  pages: StoryPage[],
  pageId: string,
  elementId: string,
  patch: CanvasElementPatch,
) {
  return updatePage(pages, pageId, (page) => ({
    ...page,
    layout: {
      aspectRatio: 1,
      elements: page.layout!.elements.map((element) =>
        element.id === elementId ? ({ ...element, ...patch } as CanvasElement) : element,
      ),
    },
  }));
}

export function duplicateCanvasElement(pages: StoryPage[], pageId: string, elementId: string, copyId: string) {
  return updatePage(pages, pageId, (page) => {
    const source = page.layout!.elements.find((element) => element.id === elementId);
    if (!source) {
      return page;
    }
    return {
      ...page,
      layout: {
        aspectRatio: 1,
        elements: [
          ...page.layout!.elements,
          {
            ...source,
            id: copyId,
            x: Math.min(source.x + 0.05, 1 - source.width),
            y: Math.min(source.y + 0.05, 1 - source.height),
            zIndex: maxLayer(page.layout!.elements) + 1,
          },
        ],
      },
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
    return { ...page, layout: { aspectRatio: 1, elements } };
  });
}

export function deleteCanvasElement(pages: StoryPage[], pageId: string, elementId: string) {
  return updatePage(pages, pageId, (page) => ({
    ...page,
    layout: { aspectRatio: 1, elements: page.layout!.elements.filter((element) => element.id !== elementId) },
  }));
}
