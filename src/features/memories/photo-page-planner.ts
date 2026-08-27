import type { MemoryDraftPagePlan, PhotoTemplateFamilyId } from "../../types/memory";
import { resolvePhotoTemplateForFamily } from "../canvas/photo-templates";

const EMPTY_PHOTO_ERROR = "请至少选择一张照片";

function invalidPageCountError(photoCount: number): Error {
  return new Error(`页数必须在 1 到 ${photoCount} 之间`);
}

function clonePlan(plan: MemoryDraftPagePlan): MemoryDraftPagePlan {
  return { ...plan, photoUris: [...plan.photoUris] };
}

function clonePlanWithoutTemplate(plan: MemoryDraftPagePlan, photoUris = plan.photoUris): MemoryDraftPagePlan {
  const { photoTemplateId: _photoTemplateId, ...rest } = plan;
  return { ...rest, photoUris: [...photoUris] };
}

export function distributePhotoUris(photoUris: readonly string[], pageCount: number): MemoryDraftPagePlan[] {
  if (photoUris.length === 0) throw new Error(EMPTY_PHOTO_ERROR);
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > photoUris.length) {
    throw invalidPageCountError(photoUris.length);
  }

  const photosPerPage = Math.floor(photoUris.length / pageCount);
  const remainder = photoUris.length % pageCount;
  let offset = 0;

  return Array.from({ length: pageCount }, (_, index) => {
    const count = photosPerPage + (index < remainder ? 1 : 0);
    const plan = { photoUris: Array.from(photoUris.slice(offset, offset + count)) };
    offset += count;
    return plan;
  });
}

export function applyTemplateFamilyToPlans(
  plans: readonly MemoryDraftPagePlan[],
  familyId: PhotoTemplateFamilyId,
): { plans: MemoryDraftPagePlan[]; skippedPageNumbers: number[] } {
  const skippedPageNumbers: number[] = [];
  const nextPlans = plans.map((plan, index) => {
    const template = resolvePhotoTemplateForFamily(familyId, plan.photoUris.length);
    if (!template) {
      skippedPageNumbers.push(index + 1);
      return clonePlanWithoutTemplate(plan);
    }
    return { ...clonePlanWithoutTemplate(plan), photoTemplateId: template.id };
  });

  return { plans: nextPlans, skippedPageNumbers };
}

export function createBalancedPhotoPagePlans(
  photoUris: readonly string[],
  familyId: PhotoTemplateFamilyId = "classic",
): MemoryDraftPagePlan[] {
  const pageCount = Math.ceil(photoUris.length / 3);
  return applyTemplateFamilyToPlans(distributePhotoUris(photoUris, pageCount), familyId).plans;
}

export function movePhotoToPage(
  plans: readonly MemoryDraftPagePlan[],
  photoUri: string,
  targetIndex: number,
): { plans: MemoryDraftPagePlan[]; error?: string } {
  const sourceIndex = plans.findIndex((plan) => plan.photoUris.includes(photoUri));
  const clonedPlans = plans.map(clonePlan);

  if (sourceIndex < 0 || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= plans.length || sourceIndex === targetIndex) {
    return { plans: clonedPlans };
  }

  if (plans[sourceIndex].photoUris.length === 1) {
    return { plans: clonedPlans, error: "每页至少保留一张照片" };
  }

  return {
    plans: clonedPlans.map((plan, index) => {
      if (index === sourceIndex) {
        const photoUris = [...plan.photoUris];
        photoUris.splice(photoUris.indexOf(photoUri), 1);
        return clonePlanWithoutTemplate(plan, photoUris);
      }
      if (index === targetIndex) {
        return clonePlanWithoutTemplate(plan, [...plan.photoUris, photoUri]);
      }
      return plan;
    }),
  };
}
