import type { CanvasElement, CanvasImageElement, CanvasLayout, StoryPage } from "../../types/memory";
import { radiansToDegrees, resolvePhotoTemplate, type PhotoTemplateDefinition } from "./photo-templates";
import { bodyFontFamily } from "../typography/fonts";

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

const TEMPLATE_EPSILON = 1e-6;
const approximatelyEqual = (left: number, right: number) =>
  Math.abs(left - right) <= TEMPLATE_EPSILON;

function repairedTemplateRotations(
  elements: CanvasLayout["elements"],
  template: PhotoTemplateDefinition | undefined,
): ReadonlyMap<number, number> {
  if (!template) return new Map();
  const orderedImages = elements
    .map((element, index) => ({ element, index }))
    .filter((item): item is { element: CanvasImageElement; index: number } => item.element.type === "image")
    .sort((left, right) => left.element.zIndex - right.element.zIndex || left.index - right.index);
  if (orderedImages.length !== template.photoCount) return new Map();

  const matchesTemplate = orderedImages.every(({ element }, slotIndex) => {
    const slot = template.slots[slotIndex];
    return approximatelyEqual(element.x, slot.x)
      && approximatelyEqual(element.y, slot.y)
      && approximatelyEqual(element.width, slot.width)
      && approximatelyEqual(element.height, slot.height)
      && (approximatelyEqual(element.rotation, slot.rotation)
        || approximatelyEqual(element.rotation, radiansToDegrees(slot.rotation)));
  });
  if (!matchesTemplate) return new Map();

  return new Map(orderedImages.map(({ index }, slotIndex) => [index, template.slots[slotIndex].rotation]));
}

export const MAX_NORMALIZED_ELEMENT_SIZE = 1;

export function normalizeLayout(layout: CanvasLayout): CanvasLayout {
  const ids = new Map<string, number>();
  const { photoPlanVersion, photoTemplateId, elements, ...metadata } = layout;
  const template = resolvePhotoTemplate(photoTemplateId);
  const imageCount = elements.filter((element) => element.type === "image").length;
  const rotationRepairs = repairedTemplateRotations(elements, template);
  return {
    ...metadata,
    aspectRatio: 3 / 4,
    ...(photoPlanVersion === 1 ? { photoPlanVersion: 1 } : {}),
    ...(template?.photoCount === imageCount ? { photoTemplateId: template.id } : {}),
    elements: elements.map((element, index) => {
      const occurrence = (ids.get(element.id) ?? 0) + 1;
      ids.set(element.id, occurrence);
      const normalized = {
        ...element,
        id: occurrence === 1 ? element.id : `${element.id}-${occurrence}`,
        x: clamp(element.x, -0.95, 0.95),
        y: clamp(element.y, -0.95, 0.95),
        width: clamp(element.width, 0.03, MAX_NORMALIZED_ELEMENT_SIZE),
        height: clamp(element.height, 0.03, MAX_NORMALIZED_ELEMENT_SIZE),
        rotation: rotationRepairs.get(index) ?? element.rotation,
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
