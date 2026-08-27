import {
  applyTemplateFamilyToPlans,
  createBalancedPhotoPagePlans,
  distributePhotoUris,
  movePhotoToPage,
} from "../src/features/memories/photo-page-planner";
import type { MemoryDraftPagePlan, PhotoTemplateFamilyId } from "../src/types/memory";

const photos = Array.from({ length: 8 }, (_, index) => `file://photo-${index + 1}.jpg`);

describe("photo page planner", () => {
  it("distributes eight photos across three pages in order using the balanced remainder", () => {
    expect(distributePhotoUris(photos, 3).map((plan) => plan.photoUris)).toEqual([
      photos.slice(0, 3),
      photos.slice(3, 6),
      photos.slice(6),
    ]);
  });

  it("distributes four photos across two pages evenly and in order", () => {
    expect(distributePhotoUris(photos.slice(0, 4), 2).map((plan) => plan.photoUris)).toEqual([
      photos.slice(0, 2),
      photos.slice(2, 4),
    ]);
  });

  it("rejects empty photos and invalid page counts with exact messages", () => {
    expect(() => distributePhotoUris([], 1)).toThrow("请至少选择一张照片");
    expect(() => distributePhotoUris(photos, 0)).toThrow("页数必须在 1 到 8 之间");
    expect(() => distributePhotoUris(photos, 9)).toThrow("页数必须在 1 到 8 之间");
    expect(() => distributePhotoUris(photos, 1.5)).toThrow("页数必须在 1 到 8 之间");
  });

  it("uses ceil(photoCount / 3) pages by default", () => {
    const plans = createBalancedPhotoPagePlans(photos);
    expect(plans).toHaveLength(3);
    expect(plans.map((plan) => plan.photoUris.length)).toEqual([3, 3, 2]);
    expect(plans.flatMap((plan) => plan.photoUris)).toEqual(photos);
  });

  it("maps every family to its one-, two-, and three-photo templates", () => {
    const families: readonly PhotoTemplateFamilyId[] = ["classic", "magazine", "story", "collage", "columns"];
    const plans: MemoryDraftPagePlan[] = [
      { photoUris: ["one"] },
      { photoUris: ["two", "three"] },
      { photoUris: ["four", "five", "six"] },
    ];

    for (const familyId of families) {
      expect(applyTemplateFamilyToPlans(plans, familyId).plans.map((plan) => plan.photoTemplateId)).toEqual([
        `${familyId}-1`,
        `${familyId}-2`,
        `${familyId}-3`,
      ]);
    }
  });

  it("clears templates and reports one-based positions for pages over three photos", () => {
    const plans: MemoryDraftPagePlan[] = [
      { photoUris: ["one", "two", "three", "four"], photoTemplateId: "classic-3" },
      { photoUris: ["five"], photoTemplateId: "classic-1" },
      { photoUris: ["six", "seven", "eight", "nine"], photoTemplateId: "classic-2" },
    ];

    const result = applyTemplateFamilyToPlans(plans, "story");

    expect(result.plans.map((plan) => plan.photoTemplateId)).toEqual([undefined, "story-1", undefined]);
    expect(result.skippedPageNumbers).toEqual([1, 3]);
    expect(plans[0].photoTemplateId).toBe("classic-3");
  });

  it("moves a photo to another page, appending it and clearing only changed templates", () => {
    const plans: MemoryDraftPagePlan[] = [
      { photoUris: ["one", "two"], photoTemplateId: "classic-2" },
      { photoUris: ["three"], photoTemplateId: "classic-1" },
      { photoUris: ["four"], photoTemplateId: "classic-1" },
    ];

    const result = movePhotoToPage(plans, "one", 1);

    expect(result.error).toBeUndefined();
    expect(result.plans.map((plan) => plan.photoUris)).toEqual([["two"], ["three", "one"], ["four"]]);
    expect(result.plans.map((plan) => plan.photoTemplateId)).toEqual([undefined, undefined, "classic-1"]);
  });

  it("rejects moving the last photo from a page with the exact error", () => {
    const plans: MemoryDraftPagePlan[] = [
      { photoUris: ["only"], photoTemplateId: "classic-1" },
      { photoUris: ["other"], photoTemplateId: "classic-1" },
    ];

    const result = movePhotoToPage(plans, "only", 1);

    expect(result.error).toBe("每页至少保留一张照片");
    expect(result.plans).toEqual(plans);
  });

  it("makes invalid, unknown, and same-page moves no-ops", () => {
    const plans: MemoryDraftPagePlan[] = [
      { photoUris: ["one", "two"], photoTemplateId: "classic-2" },
      { photoUris: ["three"], photoTemplateId: "classic-1" },
    ];

    for (const result of [
      movePhotoToPage(plans, "unknown", 1),
      movePhotoToPage(plans, "one", -1),
      movePhotoToPage(plans, "one", 2),
      movePhotoToPage(plans, "one", 1.5),
      movePhotoToPage(plans, "one", 0),
    ]) {
      expect(result.error).toBeUndefined();
      expect(result.plans).toEqual(plans);
    }
  });

  it("does not mutate input plans or any nested photo arrays", () => {
    const plans: MemoryDraftPagePlan[] = [
      { photoUris: ["one", "two"], photoTemplateId: "classic-2" },
      { photoUris: ["three"], photoTemplateId: "classic-1" },
    ];
    const originalPlans = plans.map((plan) => ({ ...plan, photoUris: [...plan.photoUris] }));
    const applied = applyTemplateFamilyToPlans(plans, "magazine");
    const moved = movePhotoToPage(plans, "one", 1);

    expect(plans).toEqual(originalPlans);
    expect(applied.plans).not.toBe(plans);
    expect(applied.plans[0].photoUris).not.toBe(plans[0].photoUris);
    expect(moved.plans).not.toBe(plans);
    expect(moved.plans[0].photoUris).not.toBe(plans[0].photoUris);
  });
});
