import type { CanvasElement, CanvasLayout, StoryPage } from "../../types/memory";
import { resolvePhotoTemplate } from "./photo-templates";
import { bodyFontFamily } from "../typography/fonts";

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

export const MAX_NORMALIZED_ELEMENT_SIZE = 1;

export function normalizeLayout(layout: CanvasLayout): CanvasLayout {
  const ids = new Map<string, number>();
  const { photoPlanVersion, photoTemplateId, elements, ...metadata } = layout;
  return {
    ...metadata,
    aspectRatio: 3 / 4,
    ...(photoPlanVersion === 1 ? { photoPlanVersion: 1 } : {}),
    ...(resolvePhotoTemplate(photoTemplateId) ? { photoTemplateId } : {}),
    elements: elements.map((element) => {
      const occurrence = (ids.get(element.id) ?? 0) + 1;
      ids.set(element.id, occurrence);
      const normalized = {
        ...element,
        id: occurrence === 1 ? element.id : `${element.id}-${occurrence}`,
        x: clamp(element.x, -0.95, 0.95),
        y: clamp(element.y, -0.95, 0.95),
        width: clamp(element.width, 0.03, MAX_NORMALIZED_ELEMENT_SIZE),
        height: clamp(element.height, 0.03, MAX_NORMALIZED_ELEMENT_SIZE),
      } as CanvasElement;
      return normalized.type === "text"
        ? {
            ...normalized,
            fontStyle: normalized.fontStyle === "ChaoHuaTypewriter"
              ? bodyFontFamily
              : normalized.fontStyle ?? bodyFontFamily,
            fontSize: normalized.fontSize ?? 16,
          }
        : normalized;
    }),
  };
}

export function createLegacyLayout(page: Omit<StoryPage, "layout">): CanvasLayout {
  const elements: CanvasElement[] = [];
  if (page.photoUri) {
    elements.push({ id: `${page.id}:image`, type: "image", uri: page.photoUri, x: 0.08, y: 0.08, width: 0.84, height: 0.48, rotation: 0, zIndex: 1 });
  }
  elements.push(
    { id: `${page.id}:headline`, type: "text", text: page.headline, fontStyle: bodyFontFamily, color: "#24312B", fontSize: 22, x: 0.1, y: page.photoUri ? 0.62 : 0.24, width: 0.8, height: 0.12, rotation: 0, zIndex: 2 },
    { id: `${page.id}:body`, type: "text", text: page.body, fontStyle: bodyFontFamily, color: "#69756E", fontSize: 16, x: 0.1, y: page.photoUri ? 0.78 : 0.42, width: 0.8, height: 0.14, rotation: 0, zIndex: 3 }
  );
  return {
    aspectRatio: 3 / 4,
    elements,
    ...(page.kind === "cover" && page.coverColor ? { coverColor: page.coverColor } : {}),
    ...(page.kind === "cover" && page.coverImage ? { coverImage: page.coverImage } : {}),
  };
}
