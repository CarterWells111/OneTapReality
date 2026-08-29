import type { PhotoCropState, PhotoTemplateFamilyId, PhotoTemplateId } from "../../types/memory";
import { resolvePhotoTemplate, resolvePhotoTemplateForFamily } from "./photo-templates";

export type PhotoLayoutDraftItem = {
  crop?: PhotoCropState;
  id: string;
  uri: string;
};

export function movePhotoLayoutDraftItem(
  photos: readonly PhotoLayoutDraftItem[],
  photoId: string,
  targetIndex: number,
): PhotoLayoutDraftItem[] {
  const sourceIndex = photos.findIndex((photo) => photo.id === photoId);
  if (sourceIndex < 0 || photos.length === 0) return [...photos];
  const boundedTarget = Math.max(0, Math.min(targetIndex, photos.length - 1));
  const next = [...photos];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(boundedTarget, 0, moved);
  return next;
}

export function removePhotoLayoutDraftItem(
  photos: readonly PhotoLayoutDraftItem[],
  photoId: string,
): PhotoLayoutDraftItem[] {
  return photos.filter((photo) => photo.id !== photoId);
}

export function resolveTemplateAfterPhotoCountChange(
  templateId: PhotoTemplateId | undefined,
  photoCount: number,
  fallbackFamily?: PhotoTemplateFamilyId,
): PhotoTemplateId | undefined {
  const family = resolvePhotoTemplate(templateId)?.familyId ?? fallbackFamily;
  return family ? resolvePhotoTemplateForFamily(family, photoCount)?.id : undefined;
}
