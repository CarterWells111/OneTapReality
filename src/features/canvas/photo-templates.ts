import type {
  CanvasLayout,
  CanvasImageElement,
  CanvasTextElement,
  CanvasElement,
  PhotoTemplateFamilyId,
  PhotoTemplateId,
} from "../../types/memory";
import { bodyFontFamily } from "../typography/fonts";

export { photoTemplateFamilyIds, type PhotoTemplateFamilyId, type PhotoTemplateId } from "../../types/memory";

export type PhotoTemplateSlot = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
};

export type PhotoTemplateDefinition = {
  readonly id: PhotoTemplateId;
  readonly familyId: PhotoTemplateFamilyId;
  readonly familyLabel: string;
  readonly photoCount: 1 | 2 | 3;
  readonly slots: readonly PhotoTemplateSlot[];
  /** Previous geometry is recognized only when repairing already saved collage rotations. */
  readonly legacySlots?: readonly PhotoTemplateSlot[];
  readonly caption: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
};

export const PHOTO_TEMPLATE_SAMPLE_TEXT = "写下这一刻";

export const PHOTO_TEMPLATE_FAMILIES = [
  { id: "classic", label: "经典留白" },
  { id: "magazine", label: "杂志侧栏" },
  { id: "story", label: "横向叙事" },
  { id: "collage", label: "手账错落" },
  { id: "columns", label: "竖向切片" },
] as const satisfies readonly { id: PhotoTemplateFamilyId; label: string }[];

export const degreesToRadians = (degrees: number) => degrees * Math.PI / 180;
export const radiansToDegrees = (radians: number) => radians * 180 / Math.PI;

const slot = (
  x: number,
  y: number,
  width: number,
  height: number,
  rotationDegrees = 0,
): PhotoTemplateSlot => ({
  x,
  y,
  width,
  height,
  rotation: degreesToRadians(rotationDegrees),
});

export const PHOTO_TEMPLATES = [
  { id: "classic-1", familyId: "classic", familyLabel: "经典留白", photoCount: 1, slots: [slot(.10, .10, .80, .80)], caption: { x: .10, y: .015, width: .80, height: .07 } },
  { id: "classic-2", familyId: "classic", familyLabel: "经典留白", photoCount: 2, slots: [slot(.09, .08, .82, .31), slot(.09, .46, .82, .32)], caption: { x: .09, y: .84, width: .82, height: .07 } },
  { id: "classic-3", familyId: "classic", familyLabel: "经典留白", photoCount: 3, slots: [slot(.09, .08, .82, .35), slot(.09, .50, .38, .28), slot(.53, .50, .38, .28)], caption: { x: .09, y: .84, width: .82, height: .07 } },
  { id: "magazine-1", familyId: "magazine", familyLabel: "杂志侧栏", photoCount: 1, slots: [slot(.10, .10, .65, .80)], caption: { x: .10, y: .015, width: .80, height: .07 } },
  { id: "magazine-2", familyId: "magazine", familyLabel: "杂志侧栏", photoCount: 2, slots: [slot(.08, .08, .52, .70), slot(.64, .16, .28, .52)], caption: { x: .08, y: .84, width: .84, height: .07 } },
  { id: "magazine-3", familyId: "magazine", familyLabel: "杂志侧栏", photoCount: 3, slots: [slot(.08, .08, .51, .70), slot(.63, .08, .29, .29), slot(.63, .49, .29, .29)], caption: { x: .08, y: .84, width: .84, height: .07 } },
  { id: "story-1", familyId: "story", familyLabel: "横向叙事", photoCount: 1, slots: [slot(.07, .25, .86, .49)], caption: { x: .07, y: .10, width: .86, height: .08 } },
  { id: "story-2", familyId: "story", familyLabel: "横向叙事", photoCount: 2, slots: [slot(.07, .07, .86, .36), slot(.18, .51, .75, .29)], caption: { x: .09, y: .84, width: .82, height: .07 } },
  { id: "story-3", familyId: "story", familyLabel: "横向叙事", photoCount: 3, slots: [slot(.07, .07, .86, .20), slot(.14, .34, .79, .20), slot(.07, .61, .79, .20)], caption: { x: .09, y: .86, width: .82, height: .07 } },
  { id: "collage-1", familyId: "collage", familyLabel: "手账错落", photoCount: 1, slots: [slot(.14, .09, .72, .82, -2.5)], caption: { x: .10, y: 0, width: .80, height: .07 } },
  { id: "collage-2", familyId: "collage", familyLabel: "手账错落", photoCount: 2, slots: [slot(.08, .10, .56, .39, -3), slot(.38, .42, .54, .36, 3)], legacySlots: [slot(.08, .11, .56, .48, -3), slot(.38, .44, .54, .45, 3)], caption: { x: .10, y: .85, width: .80, height: .07 } },
  { id: "collage-3", familyId: "collage", familyLabel: "手账错落", photoCount: 3, slots: [slot(.08, .08, .53, .31, -3), slot(.47, .25, .45, .28, 3), slot(.13, .54, .47, .25, -1.5)], legacySlots: [slot(.08, .08, .53, .39, -3), slot(.47, .27, .45, .34, 3), slot(.13, .58, .47, .34, -1.5)], caption: { x: .10, y: .85, width: .80, height: .07 } },
  { id: "columns-1", familyId: "columns", familyLabel: "竖向切片", photoCount: 1, slots: [slot(.20, .08, .60, .84)], caption: { x: .09, y: 0, width: .82, height: .07 } },
  { id: "columns-2", familyId: "columns", familyLabel: "竖向切片", photoCount: 2, slots: [slot(.08, .08, .39, .71), slot(.53, .08, .39, .71)], caption: { x: .09, y: .85, width: .82, height: .07 } },
  { id: "columns-3", familyId: "columns", familyLabel: "竖向切片", photoCount: 3, slots: [slot(.06, .08, .27, .71), slot(.365, .08, .27, .71), slot(.67, .08, .27, .71)], caption: { x: .09, y: .85, width: .82, height: .07 } },
] as const satisfies readonly PhotoTemplateDefinition[];

export function resolvePhotoTemplate(id: string | undefined): PhotoTemplateDefinition | undefined {
  return PHOTO_TEMPLATES.find((template) => template.id === id);
}

export function getPhotoTemplatesForCount(count: number): readonly PhotoTemplateDefinition[] {
  return PHOTO_TEMPLATES.filter((template) => template.photoCount === count);
}

export function resolvePhotoTemplateForFamily(familyId: PhotoTemplateFamilyId, count: number): PhotoTemplateDefinition | undefined {
  return PHOTO_TEMPLATES.find((template) => template.familyId === familyId && template.photoCount === count);
}

export function createPhotoTemplateCaption(templateId: string, id: string, zIndex: number): CanvasTextElement | null {
  const template = resolvePhotoTemplate(templateId);
  if (!template) return null;
  return { id, type: "text", text: PHOTO_TEMPLATE_SAMPLE_TEXT, fontStyle: bodyFontFamily, color: "#24312B", fontSize: 16,
    ...template.caption, rotation: 0, zIndex, templateCaption: true };
}

export function placeManagedTemplateCaption(element: CanvasElement, template: PhotoTemplateDefinition): CanvasElement {
  return element.type === "text" && element.templateCaption === true
    ? { ...element, ...template.caption }
    : element;
}

export function createPhotoTemplateLayout(photoUris: string[], templateId: string): CanvasLayout | null {
  const template = resolvePhotoTemplate(templateId);
  if (!template || photoUris.length !== template.photoCount) return null;
  const elements: CanvasImageElement[] = photoUris.map((uri, index) => {
    const templateSlot = template.slots[index];
    return { id: `image-${index + 1}`, type: "image", uri, x: templateSlot.x, y: templateSlot.y, width: templateSlot.width, height: templateSlot.height, rotation: templateSlot.rotation, zIndex: index + 1 };
  });
  return { aspectRatio: 0.75, photoTemplateId: template.id, elements };
}
