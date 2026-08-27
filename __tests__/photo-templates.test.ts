import {
  PHOTO_TEMPLATE_FAMILIES,
  PHOTO_TEMPLATES,
  createPhotoTemplateLayout,
  getPhotoTemplatesForCount,
  resolvePhotoTemplate,
  resolvePhotoTemplateForFamily,
} from "../src/features/canvas/photo-templates";

describe("photo template registry", () => {
  it("defines the exact fifteen-template contract", () => {
    const expected = [
      ["classic-1", "classic", "经典留白", 1, [[.10, .10, .80, .80, 0]]],
      ["classic-2", "classic", "经典留白", 2, [[.09, .09, .82, .37, 0], [.09, .54, .82, .37, 0]]],
      ["classic-3", "classic", "经典留白", 3, [[.09, .09, .82, .43, 0], [.09, .63, .38, .28, 0], [.53, .63, .38, .28, 0]]],
      ["magazine-1", "magazine", "杂志侧栏", 1, [[.10, .10, .65, .80, 0]]],
      ["magazine-2", "magazine", "杂志侧栏", 2, [[.08, .09, .52, .82, 0], [.64, .18, .28, .57, 0]]],
      ["magazine-3", "magazine", "杂志侧栏", 3, [[.08, .09, .51, .82, 0], [.63, .09, .29, .34, 0], [.63, .57, .29, .34, 0]]],
      ["story-1", "story", "横向叙事", 1, [[.07, .25, .86, .49, 0]]],
      ["story-2", "story", "横向叙事", 2, [[.07, .07, .86, .43, 0], [.18, .57, .75, .36, 0]]],
      ["story-3", "story", "横向叙事", 3, [[.07, .07, .86, .25, 0], [.14, .375, .79, .25, 0], [.07, .68, .79, .25, 0]]],
      ["collage-1", "collage", "手账错落", 1, [[.14, .09, .72, .82, -2.5]]],
      ["collage-2", "collage", "手账错落", 2, [[.08, .11, .56, .48, -3], [.38, .44, .54, .45, 3]]],
      ["collage-3", "collage", "手账错落", 3, [[.08, .08, .53, .39, -3], [.47, .27, .45, .34, 3], [.13, .58, .47, .34, -1.5]]],
      ["columns-1", "columns", "竖向切片", 1, [[.20, .08, .60, .84, 0]]],
      ["columns-2", "columns", "竖向切片", 2, [[.08, .08, .39, .84, 0], [.53, .08, .39, .84, 0]]],
      ["columns-3", "columns", "竖向切片", 3, [[.06, .08, .27, .84, 0], [.365, .08, .27, .84, 0], [.67, .08, .27, .84, 0]]],
    ] as const;
    expect(PHOTO_TEMPLATE_FAMILIES.map((family) => family.id)).toEqual([
      "classic",
      "magazine",
      "story",
      "collage",
      "columns",
    ]);
    expect(PHOTO_TEMPLATE_FAMILIES.map((family) => family.label)).toEqual(["经典留白", "杂志侧栏", "横向叙事", "手账错落", "竖向切片"]);
    expect(PHOTO_TEMPLATES).toHaveLength(15);
    expect(new Set(PHOTO_TEMPLATES.map((template) => template.id)).size).toBe(15);
    expect(PHOTO_TEMPLATES.map((template) => [template.id, template.familyId, template.familyLabel, template.photoCount, template.slots.map((item) => [item.x, item.y, item.width, item.height, item.rotation])])).toEqual(expected);
    expect([1, 2, 3, 4].map((count) => getPhotoTemplatesForCount(count).length)).toEqual([5, 5, 5, 0]);
  });

  it("keeps every normalized slot within the page and matches its count", () => {
    for (const template of PHOTO_TEMPLATES) {
      expect(template.slots).toHaveLength(template.photoCount);
      for (const slot of template.slots) {
        expect(slot.x).toBeGreaterThanOrEqual(0);
        expect(slot.y).toBeGreaterThanOrEqual(0);
        expect(slot.x + slot.width).toBeLessThanOrEqual(1);
        expect(slot.y + slot.height).toBeLessThanOrEqual(1);
        expect(slot).toHaveProperty("width");
        expect(slot).toHaveProperty("height");
        expect(Number.isFinite(slot.width)).toBe(true);
        expect(Number.isFinite(slot.height)).toBe(true);
        expect(Number.isFinite(slot.rotation)).toBe(true);
        expect(slot.width).toBeGreaterThan(0);
        expect(slot.height).toBeGreaterThan(0);
      }
      expect(template.familyLabel).toBeDefined();
    }
  });

  it("resolves each family for supported photo counts", () => {
    for (const familyId of ["classic", "magazine", "story", "collage", "columns"] as const) {
      for (const count of [1, 2, 3] as const) {
        expect(resolvePhotoTemplateForFamily(familyId, count)).toMatchObject({ id: `${familyId}-${count}`, familyId, photoCount: count });
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
