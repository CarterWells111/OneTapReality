import { createLegacyLayout, normalizeLayout } from "../src/features/canvas/canvas-layout";
import type { CanvasLayout } from "../src/types/memory";

describe("canvas layout", () => {
  it("creates a square legacy layout with image and text elements", () => {
    const layout = createLegacyLayout({
      id: "page-1",
      position: 0,
      kind: "cover",
      headline: "West Lake",
      body: "A weekend together",
      photoUri: "file://west-lake.jpg",
    });

    expect(layout.aspectRatio).toBe(0.75);
    expect(layout.elements.map((element) => element.type)).toEqual(["image", "text", "text"]);
  });

  it("clamps layout bounds and assigns unique element IDs", () => {
    const layout = normalizeLayout({
      aspectRatio: 0.75,
      elements: [
        { id: "same", type: "text", x: -1, y: 2, width: 3, height: 0, rotation: 0, zIndex: 1, text: "One", fontStyle: "system", color: "#000000", fontSize: 16 },
        { id: "same", type: "sticker", x: 0.5, y: 0.5, width: 0.2, height: 0.2, rotation: 0, zIndex: 2, stickerId: "sticker1-01" },
      ],
    });

    expect(layout.elements[0]).toMatchObject({ id: "same", x: -0.95, y: 0.95, width: 1, height: 0.03 });
    expect(layout.elements[1].id).toBe("same-2");
  });

  it("preserves normalized full-bleed dimensions from a shared payload", () => {
    const layout = normalizeLayout({
      aspectRatio: 0.75,
      elements: [
        { id: "full-bleed", type: "image", uri: "https://cdn.test/full.jpg", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0 },
      ],
    });

    expect(layout.elements[0]).toMatchObject({ width: 1, height: 1 });
  });

  it("preserves known template IDs and drops unknown serialized IDs", () => {
    const image = { id: "image-1", type: "image" as const, uri: "file:///one.jpg", x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotation: 0, zIndex: 1 };
    expect(normalizeLayout({ aspectRatio: 0.75, photoTemplateId: "classic-1", elements: [image] })).toMatchObject({ photoTemplateId: "classic-1" });
    expect(normalizeLayout({ aspectRatio: 0.75, photoTemplateId: "forged-template" as unknown as CanvasLayout["photoTemplateId"], elements: [] })).not.toHaveProperty("photoTemplateId");
  });

  it("drops a known template when its image count mismatches while preserving freeform geometry", () => {
    const elements: CanvasLayout["elements"] = [
      { id: "one", type: "image", uri: "file:///one.jpg", x: 0.13, y: 0.17, width: 0.31, height: 0.27, rotation: 4, zIndex: 3 },
      { id: "two", type: "image", uri: "file:///two.jpg", x: 0.56, y: 0.49, width: 0.28, height: 0.33, rotation: -2, zIndex: 8 },
    ];

    const normalized = normalizeLayout({ aspectRatio: 0.75, photoTemplateId: "classic-3", elements });

    expect(normalized).not.toHaveProperty("photoTemplateId");
    expect(normalized.elements).toEqual(elements);
  });

  it("preserves only the valid planned-photo marker", () => {
    expect(normalizeLayout({ aspectRatio: 0.75, photoPlanVersion: 1, elements: [] })).toHaveProperty("photoPlanVersion", 1);
    expect(normalizeLayout({ aspectRatio: 0.75, photoPlanVersion: 2 as unknown as 1, elements: [] })).not.toHaveProperty("photoPlanVersion");
  });
});
