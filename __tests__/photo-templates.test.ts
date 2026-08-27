import {
  PHOTO_TEMPLATE_FAMILIES,
  PHOTO_TEMPLATES,
  createPhotoTemplateLayout,
  getPhotoTemplatesForCount,
  resolvePhotoTemplate,
  resolvePhotoTemplateForFamily,
} from "../src/features/canvas/photo-templates";

describe("photo template registry", () => {
  it("defines five families and exactly fifteen unique templates", () => {
    expect(PHOTO_TEMPLATE_FAMILIES.map((family) => family.id)).toEqual([
      "classic",
      "magazine",
      "story",
      "collage",
      "columns",
    ]);
    expect(PHOTO_TEMPLATES).toHaveLength(15);
    expect(new Set(PHOTO_TEMPLATES.map((template) => template.id)).size).toBe(15);
    expect([1, 2, 3, 4].map((count) => getPhotoTemplatesForCount(count).length)).toEqual([5, 5, 5, 0]);
  });

  it("keeps every normalized slot within the page and matches its count", () => {
    for (const template of PHOTO_TEMPLATES) {
      expect(template.slots).toHaveLength(template.photoCount);
      for (const slot of template.slots) {
        expect(slot.x).toBeGreaterThanOrEqual(0);
        expect(slot.y).toBeGreaterThanOrEqual(0);
        expect(slot.x + slot.w).toBeLessThanOrEqual(1);
        expect(slot.y + slot.h).toBeLessThanOrEqual(1);
      }
    }
  });

  it("creates a magazine two-photo layout with stable image IDs", () => {
    const layout = createPhotoTemplateLayout(["one.jpg", "two.jpg"], "magazine-2");
    expect(layout).toMatchObject({ aspectRatio: 0.75, photoTemplateId: "magazine-2" });
    expect(layout?.elements).toEqual([
      expect.objectContaining({ id: "image-1", type: "image", uri: "one.jpg", x: 0.08, y: 0.09, width: 0.52, height: 0.82 }),
      expect.objectContaining({ id: "image-2", type: "image", uri: "two.jpg", x: 0.64, y: 0.18, width: 0.28, height: 0.57 }),
    ]);
  });

  it("rejects unknown templates and photo count mismatches", () => {
    expect(createPhotoTemplateLayout(["one.jpg"], "magazine-2")).toBeNull();
    expect(createPhotoTemplateLayout(["one.jpg"], "unknown")).toBeNull();
    expect(resolvePhotoTemplate(undefined)).toBeUndefined();
    expect(resolvePhotoTemplateForFamily("classic", 4)).toBeUndefined();
  });
});
