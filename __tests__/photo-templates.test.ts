import {
  PHOTO_TEMPLATE_FAMILIES,
  PHOTO_TEMPLATES,
  createPhotoTemplateLayout,
  createPhotoTemplateCaption,
  degreesToRadians,
  getPhotoTemplatesForCount,
  resolvePhotoTemplate,
  resolvePhotoTemplateForFamily,
  PHOTO_TEMPLATE_SAMPLE_TEXT,
} from "../src/features/canvas/photo-templates";

describe("photo template registry", () => {
  it("defines the exact fifteen-template contract", () => {
    const expected = [
      ["classic-1", "classic", "经典留白", 1, [[.10, .10, .80, .80, 0]]],
      ["classic-2", "classic", "经典留白", 2, [[.09, .08, .82, .31, 0], [.09, .46, .82, .32, 0]]],
      ["classic-3", "classic", "经典留白", 3, [[.09, .08, .82, .35, 0], [.09, .50, .38, .28, 0], [.53, .50, .38, .28, 0]]],
      ["magazine-1", "magazine", "杂志侧栏", 1, [[.10, .10, .65, .80, 0]]],
      ["magazine-2", "magazine", "杂志侧栏", 2, [[.08, .08, .52, .70, 0], [.64, .16, .28, .52, 0]]],
      ["magazine-3", "magazine", "杂志侧栏", 3, [[.08, .08, .51, .70, 0], [.63, .08, .29, .29, 0], [.63, .49, .29, .29, 0]]],
      ["story-1", "story", "横向叙事", 1, [[.07, .25, .86, .49, 0]]],
      ["story-2", "story", "横向叙事", 2, [[.07, .07, .86, .36, 0], [.18, .51, .75, .29, 0]]],
      ["story-3", "story", "横向叙事", 3, [[.07, .07, .86, .20, 0], [.14, .34, .79, .20, 0], [.07, .61, .79, .20, 0]]],
      ["collage-1", "collage", "手账错落", 1, [[.14, .09, .72, .82, degreesToRadians(-2.5)]]],
      ["collage-2", "collage", "手账错落", 2, [[.08, .10, .56, .39, degreesToRadians(-3)], [.38, .42, .54, .36, degreesToRadians(3)]]],
      ["collage-3", "collage", "手账错落", 3, [[.08, .08, .53, .31, degreesToRadians(-3)], [.47, .25, .45, .28, degreesToRadians(3)], [.13, .54, .47, .25, degreesToRadians(-1.5)]]],
      ["columns-1", "columns", "竖向切片", 1, [[.20, .08, .60, .84, 0]]],
      ["columns-2", "columns", "竖向切片", 2, [[.08, .08, .39, .71, 0], [.53, .08, .39, .71, 0]]],
      ["columns-3", "columns", "竖向切片", 3, [[.06, .08, .27, .71, 0], [.365, .08, .27, .71, 0], [.67, .08, .27, .71, 0]]],
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

  it("reserves one readable line outside rotated photos in all fifteen templates", () => {
    for (const template of PHOTO_TEMPLATES) {
      const caption = template.caption;
      expect(caption.width).toBeGreaterThanOrEqual(0.7);
      expect(caption.height).toBeGreaterThanOrEqual(0.06);
      expect(caption.x).toBeGreaterThanOrEqual(0);
      expect(caption.y).toBeGreaterThanOrEqual(0);
      expect(caption.x + caption.width).toBeLessThanOrEqual(1);
      expect(caption.y + caption.height).toBeLessThanOrEqual(1);
      const element = createPhotoTemplateCaption(template.id, "caption", 4)!;
      expect(element.text).toBe(PHOTO_TEMPLATE_SAMPLE_TEXT);
      expect(element.text.length * element.fontSize).toBeLessThan(caption.width * 280);
      expect(element.fontSize * 1.28 + 4).toBeLessThan(caption.height * 280 / 0.75);
      for (const slot of template.slots) {
        const radiusX = Math.abs(Math.cos(slot.rotation) * slot.width / 2) + Math.abs(Math.sin(slot.rotation) * slot.height / 2);
        const radiusY = Math.abs(Math.sin(slot.rotation) * slot.width / 2) + Math.abs(Math.cos(slot.rotation) * slot.height / 2);
        const left = slot.x + slot.width / 2 - radiusX;
        const right = slot.x + slot.width / 2 + radiusX;
        const top = slot.y + slot.height / 2 - radiusY;
        const bottom = slot.y + slot.height / 2 + radiusY;
        expect(caption.x + caption.width <= left || caption.x >= right || caption.y + caption.height <= top || caption.y >= bottom).toBe(true);
      }
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
      expect.objectContaining({ id: "image-1", type: "image", uri: "one.jpg", x: 0.08, y: 0.08, width: 0.52, height: 0.70 }),
      expect.objectContaining({ id: "image-2", type: "image", uri: "two.jpg", x: 0.64, y: 0.16, width: 0.28, height: 0.52 }),
    ]);
  });

  it("stores collage rotations in canvas radians", () => {
    const layout = createPhotoTemplateLayout(["one.jpg", "two.jpg"], "collage-2");
    const rotations = layout?.elements
      .filter((element) => element.type === "image")
      .map((element) => element.rotation);

    expect(rotations?.[0]).toBeCloseTo(-Math.PI / 60);
    expect(rotations?.[1]).toBeCloseTo(Math.PI / 60);
    expect(rotations?.every((rotation) => Math.abs(rotation) < 0.1)).toBe(true);
  });

  it("rejects unknown templates and photo count mismatches", () => {
    expect(createPhotoTemplateLayout(["one.jpg"], "magazine-2")).toBeNull();
    expect(createPhotoTemplateLayout(["one.jpg"], "unknown")).toBeNull();
    expect(resolvePhotoTemplate(undefined)).toBeUndefined();
    expect(resolvePhotoTemplateForFamily("classic", 4)).toBeUndefined();
  });
});
