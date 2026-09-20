import type { MemoryDraftPagePlan, PhotoTemplateFamilyId } from "../../types/memory";
import { MAX_PHOTOS_PER_CANVAS_PAGE } from "../canvas/auto-layout";
import { resolvePhotoTemplateForFamily } from "../canvas/photo-templates";
import { resolveTemplateAfterPhotoCountChange } from "../canvas/photo-layout-draft";
import { movePhotoUri } from "../photos/photo-order";

const EMPTY_PHOTO_ERROR = "请至少选择一张照片";
export const MAX_PHOTOS_PER_PAGE_ERROR = `每页最多 ${MAX_PHOTOS_PER_CANVAS_PAGE} 张照片`;

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

function adaptPlanPhotos(plan: MemoryDraftPagePlan, photoUris: string[]): MemoryDraftPagePlan {
  const next = clonePlanWithoutTemplate(plan, photoUris);
  const templateId = resolveTemplateAfterPhotoCountChange(plan.photoTemplateId, photoUris.length, "classic");
  return templateId ? { ...next, photoTemplateId: templateId } : next;
}

export function reorderPagePhoto(
  plans: readonly MemoryDraftPagePlan[], pageIndex: number, photoIndex: number, direction: -1 | 1,
): MemoryDraftPagePlan[] {
  return plans.map((plan, index) => index === pageIndex
    ? { ...plan, photoUris: movePhotoUri(plan.photoUris, photoIndex, direction) }
    : clonePlan(plan));
}

export function changePagePhotoCount(
  plans: readonly MemoryDraftPagePlan[], pageIndex: number, count: number,
): { plans: MemoryDraftPagePlan[]; error?: string } {
  const unchanged = () => plans.map(clonePlan);
  if (!Number.isInteger(pageIndex) || !plans[pageIndex] || !Number.isInteger(count) || count < 1) {
    return { plans: unchanged(), error: "每页至少保留一张照片" };
  }
  if (count > MAX_PHOTOS_PER_CANVAS_PAGE) return { plans: unchanged(), error: MAX_PHOTOS_PER_PAGE_ERROR };
  const next = unchanged();
  const current = next[pageIndex].photoUris;
  const growing = count > current.length;
  // Later pages may be merged away. Earlier pages keep one photo so the active index stays stable.
  const others = Array.from({ length: plans.length - 1 }, (_, offset) => (pageIndex + offset + 1) % plans.length);
  for (const index of others) {
    const other = next[index].photoUris;
    const minimum = index > pageIndex ? 0 : 1;
    while (current.length !== count && (growing ? other.length > minimum : other.length < MAX_PHOTOS_PER_CANVAS_PAGE)) {
      if (growing) current.push(other.shift()!);
      else other.unshift(current.pop()!);
    }
    if (current.length === count) break;
  }
  if (!growing && current.length > count) {
    next.push(adaptPlanPhotos({ photoUris: [], photoTemplateId: plans[pageIndex].photoTemplateId }, current.splice(count)));
  }
  if (current.length !== count) {
    return { plans: unchanged(), error: "没有可转入的照片，前面的页面需至少保留一张" };
  }
  return { plans: next.map((plan, index) => !plans[index] || plan.photoUris.length === plans[index].photoUris.length
    ? plan : adaptPlanPhotos(plans[index], plan.photoUris)).filter((plan) => plan.photoUris.length > 0) };
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

export function areDraftPhotoPlansValid(
  photoUris: readonly string[],
  plans: readonly MemoryDraftPagePlan[],
): boolean {
  if (photoUris.length === 0 || plans.length === 0 || new Set(photoUris).size !== photoUris.length) return false;
  if (plans.some((plan) => plan.photoUris.length === 0 || plan.photoUris.length > MAX_PHOTOS_PER_CANVAS_PAGE)) return false;
  const plannedPhotos = plans.flatMap((plan) => plan.photoUris);
  return plannedPhotos.length === photoUris.length
    && new Set(plannedPhotos).size === photoUris.length
    && photoUris.every((uri) => plannedPhotos.includes(uri));
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

  if (plans[targetIndex].photoUris.length >= MAX_PHOTOS_PER_CANVAS_PAGE) {
    return { plans: clonedPlans, error: MAX_PHOTOS_PER_PAGE_ERROR };
  }

  return {
    plans: clonedPlans.map((plan, index) => {
      if (index === sourceIndex) {
        const photoUris = [...plan.photoUris];
        photoUris.splice(photoUris.indexOf(photoUri), 1);
        return adaptPlanPhotos(plan, photoUris);
      }
      if (index === targetIndex) {
        return adaptPlanPhotos(plan, [...plan.photoUris, photoUri]);
      }
      return plan;
    }),
  };
}
