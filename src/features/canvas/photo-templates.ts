import type {
  CanvasLayout,
  CanvasImageElement,
  PhotoTemplateFamilyId,
  PhotoTemplateId,
} from "../../types/memory";

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
};

export const PHOTO_TEMPLATE_FAMILIES = [
  { id: "classic", label: "经典留白" },
  { id: "magazine", label: "杂志侧栏" },
  { id: "story", label: "横向叙事" },
  { id: "collage", label: "手账错落" },
  { id: "columns", label: "竖向切片" },
] as const satisfies readonly { id: PhotoTemplateFamilyId; label: string }[];

const slot = (x: number, y: number, width: number, height: number, rotation = 0): PhotoTemplateSlot => ({ x, y, width, height, rotation });

export const PHOTO_TEMPLATES = [
  { id: "classic-1", familyId: "classic", familyLabel: "经典留白", photoCount: 1, slots: [slot(.10, .10, .80, .80)] },
  { id: "classic-2", familyId: "classic", familyLabel: "经典留白", photoCount: 2, slots: [slot(.09, .09, .82, .37), slot(.09, .54, .82, .37)] },
  { id: "classic-3", familyId: "classic", familyLabel: "经典留白", photoCount: 3, slots: [slot(.09, .09, .82, .43), slot(.09, .63, .38, .28), slot(.53, .63, .38, .28)] },
  { id: "magazine-1", familyId: "magazine", familyLabel: "杂志侧栏", photoCount: 1, slots: [slot(.10, .10, .65, .80)] },
  { id: "magazine-2", familyId: "magazine", familyLabel: "杂志侧栏", photoCount: 2, slots: [slot(.08, .09, .52, .82), slot(.64, .18, .28, .57)] },
  { id: "magazine-3", familyId: "magazine", familyLabel: "杂志侧栏", photoCount: 3, slots: [slot(.08, .09, .51, .82), slot(.63, .09, .29, .34), slot(.63, .57, .29, .34)] },
  { id: "story-1", familyId: "story", familyLabel: "横向叙事", photoCount: 1, slots: [slot(.07, .25, .86, .49)] },
  { id: "story-2", familyId: "story", familyLabel: "横向叙事", photoCount: 2, slots: [slot(.07, .07, .86, .43), slot(.18, .57, .75, .36)] },
  { id: "story-3", familyId: "story", familyLabel: "横向叙事", photoCount: 3, slots: [slot(.07, .07, .86, .25), slot(.14, .375, .79, .25), slot(.07, .68, .79, .25)] },
  { id: "collage-1", familyId: "collage", familyLabel: "手账错落", photoCount: 1, slots: [slot(.14, .09, .72, .82, -2.5)] },
  { id: "collage-2", familyId: "collage", familyLabel: "手账错落", photoCount: 2, slots: [slot(.08, .11, .56, .48, -3), slot(.38, .44, .54, .45, 3)] },
  { id: "collage-3", familyId: "collage", familyLabel: "手账错落", photoCount: 3, slots: [slot(.08, .08, .53, .39, -3), slot(.47, .27, .45, .34, 3), slot(.13, .58, .47, .34, -1.5)] },
  { id: "columns-1", familyId: "columns", familyLabel: "竖向切片", photoCount: 1, slots: [slot(.20, .08, .60, .84)] },
  { id: "columns-2", familyId: "columns", familyLabel: "竖向切片", photoCount: 2, slots: [slot(.08, .08, .39, .84), slot(.53, .08, .39, .84)] },
  { id: "columns-3", familyId: "columns", familyLabel: "竖向切片", photoCount: 3, slots: [slot(.06, .08, .27, .84), slot(.365, .08, .27, .84), slot(.67, .08, .27, .84)] },
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

export function createPhotoTemplateLayout(photoUris: string[], templateId: string): CanvasLayout | null {
  const template = resolvePhotoTemplate(templateId);
  if (!template || photoUris.length !== template.photoCount) return null;
  const elements: CanvasImageElement[] = photoUris.map((uri, index) => {
    const templateSlot = template.slots[index];
    return { id: `image-${index + 1}`, type: "image", uri, x: templateSlot.x, y: templateSlot.y, width: templateSlot.width, height: templateSlot.height, rotation: templateSlot.rotation, zIndex: index + 1 };
  });
  return { aspectRatio: 0.75, photoTemplateId: template.id, elements };
}
