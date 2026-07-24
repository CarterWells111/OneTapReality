import { createLegacyLayout, normalizeLayout } from "../src/features/canvas/canvas-layout";

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

    expect(layout.aspectRatio).toBe(1);
    expect(layout.elements.map((element) => element.type)).toEqual(["image", "text", "text"]);
    expect(layout.elements[1]).toMatchObject({ fontStyle: "ChaoHuaTitleA", fontSize: 22 });
    expect(layout.elements[2]).toMatchObject({ fontStyle: "ZhaohuaTypeWriter", fontSize: 16 });
  });

  it("clamps layout bounds and assigns unique element IDs", () => {
    const layout = normalizeLayout({
      aspectRatio: 1,
      elements: [
        { id: "same", type: "text", x: -1, y: 2, width: 3, height: 0, rotation: 0, zIndex: 1, text: "One", fontStyle: "system", color: "#000000", fontSize: 16 },
        { id: "same", type: "sticker", x: 0.5, y: 0.5, width: 0.2, height: 0.2, rotation: 0, zIndex: 2, stickerId: "sticker1-01" },
      ],
    });

    expect(layout.elements[0]).toMatchObject({ id: "same", x: 0, y: 1, width: 1, height: 0.05 });
    expect(layout.elements[1].id).toBe("same-2");
  });
});
