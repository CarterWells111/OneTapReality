import type { CanvasImageElement, MemoryDraftPagePlan, StoryPage } from "../../types/memory";
import { createLegacyLayout } from "./canvas-layout";
import { MAX_PHOTOS_PER_CANVAS_PAGE } from "./auto-layout";
import { preserveLayoutMeta } from "./editor-pages";
import { resolvePhotoTemplate } from "./photo-templates";

export function createBookLayoutDraft(pages: StoryPage[]) {
  const photos = new Map<string, CanvasImageElement>();
  const plans: MemoryDraftPagePlan[] = pages.map((page, pageIndex) => {
    const layout = page.layout ?? createLegacyLayout(page);
    const images = layout.elements.filter((element): element is CanvasImageElement => element.type === "image");
    return {
      photoUris: images.map((photo, index) => {
        const key = `${pageIndex}:${index}:${photo.id}`;
        photos.set(key, photo);
        return key;
      }),
      ...(layout.photoTemplateId ? { photoTemplateId: layout.photoTemplateId } : {}),
    };
  });
  return { pages, plans, photos };
}
export type BookLayoutDraft = ReturnType<typeof createBookLayoutDraft>;

/** Existing pages keep ownership of their content; allocation keys are never image URIs. */
export function applyBookLayoutDraft(pages: StoryPage[], draft: BookLayoutDraft, plans: MemoryDraftPagePlan[]): StoryPage[] {
  if (pages !== draft.pages || plans.length !== pages.length) throw new Error("页面已变化，请重新打开整册配置。");
  let changed = false;
  const next = pages.map((page, index) => {
    const plan = plans[index];
    const original = draft.plans[index];
    if (plan.photoUris.length !== original.photoUris.length || new Set(plan.photoUris).size !== plan.photoUris.length
      || plan.photoUris.some(key => !original.photoUris.includes(key))) throw new Error("照片身份或页面归属无效。");
    const sameOrder = plan.photoUris.every((key, i) => key === original.photoUris[i]);
    if (sameOrder && plan.photoTemplateId === original.photoTemplateId) return page;
    if (plan.photoUris.length > MAX_PHOTOS_PER_CANVAS_PAGE) throw new Error("超出每页照片上限。");
    const template = resolvePhotoTemplate(plan.photoTemplateId);
    if (plan.photoTemplateId && (!template || template.photoCount !== plan.photoUris.length)) throw new Error("模板与照片数量不匹配。");
    const layout = page.layout ?? createLegacyLayout(page);
    const oldPhotos = layout.elements.filter((element): element is CanvasImageElement => element.type === "image");
    let slotIndex = 0;
    const elements = layout.elements.map(element => {
      if (element.type !== "image") return element;
      const photo = draft.photos.get(plan.photoUris[slotIndex])!;
      const slot = template?.slots[slotIndex] ?? oldPhotos[slotIndex];
      slotIndex += 1;
      return { ...photo, x: slot.x, y: slot.y, width: slot.width, height: slot.height, rotation: slot.rotation, zIndex: element.zIndex };
    });
    changed = true;
    return { ...page, ...(plan.photoUris.length ? { photoUri: draft.photos.get(plan.photoUris[0])!.uri } : {}), layout: preserveLayoutMeta(layout, elements, template?.id ?? "clear") };
  });
  return changed ? next : pages;
}
