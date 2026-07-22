import { createPhotoLayout } from "../src/features/canvas/auto-layout";

describe("photo auto layout", () => {
  it.each([1, 2, 3, 5, 10])("keeps %i photo elements inside the square canvas", (count) => {
    const layout = createPhotoLayout(Array.from({ length: count }, (_, index) => `file://photo-${index}.jpg`));
    const images = layout.elements.filter((element) => element.type === "image");

    expect(images).toHaveLength(count);
    for (const image of images) {
      expect(image.x + image.width).toBeLessThanOrEqual(1);
      expect(image.y + image.height).toBeLessThanOrEqual(1);
      expect(image.width).toBeGreaterThan(0);
      expect(image.height).toBeGreaterThan(0);
    }
  });

  it("caps one canvas page at twelve photos so its grid remains safe", () => {
    const layout = createPhotoLayout(Array.from({ length: 45 }, (_, index) => `file://photo-${index}.jpg`));

    expect(layout.elements).toHaveLength(12);
    for (const element of layout.elements) {
      expect(element.height).toBeGreaterThanOrEqual(0.05);
      expect(element.y + element.height).toBeLessThanOrEqual(1);
    }
  });
});
