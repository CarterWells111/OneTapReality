import { giftAlbumTemplates } from "../src/features/templates/gift-album-templates";

describe("gift album templates", () => {
  it("offers travel, anniversary, and confession templates with unique IDs", () => {
    expect(giftAlbumTemplates.map((template) => template.id)).toEqual([
      "couple-travel",
      "anniversary",
      "confession",
    ]);
    expect(new Set(giftAlbumTemplates.map((template) => template.id)).size).toBe(3);
  });

  it("provides displayable page prompts for every template", () => {
    for (const template of giftAlbumTemplates) {
      expect(template.name.length).toBeGreaterThan(0);
      expect(template.occasion.length).toBeGreaterThan(0);
      expect(template.prompts.cover.length).toBeGreaterThan(0);
      expect(template.prompts.photo.length).toBeGreaterThan(0);
      expect(template.prompts.closing.length).toBeGreaterThan(0);
    }
  });
});
