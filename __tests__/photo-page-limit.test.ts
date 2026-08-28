import { splitOverflowPhotoPages } from "../src/features/canvas/photo-page-limit";
import type { CanvasElement, StoryPage } from "../src/types/memory";

function image(index: number): CanvasElement {
  return {
    crop: { focusX: index / 10, focusY: 0.5, zoom: 1 + index / 10 },
    height: 0.2,
    id: `photo-${index}`,
    rotation: 0,
    type: "image",
    uri: `file:///${index}.jpg`,
    width: 0.2,
    x: 0.1,
    y: 0.1,
    zIndex: index,
  };
}

describe("splitOverflowPhotoPages", () => {
  it("keeps the first eight photos and page decoration, then inserts crop-preserving freeform pages", () => {
    const source: StoryPage = {
      body: "保留正文",
      headline: "保留标题",
      id: "source",
      kind: "photo",
      photoUri: "file:///1.jpg",
      position: 0,
      layout: {
        aspectRatio: 0.75,
        backgroundId: "paper",
        elements: [
          ...Array.from({ length: 12 }, (_, index) => image(index + 1)),
          { color: "#111111", fontSize: 16, fontStyle: "System", height: 0.1, id: "caption", rotation: 0, text: "保留", type: "text", width: 0.8, x: 0.1, y: 0.8, zIndex: 30 },
        ],
      },
    };
    const closing: StoryPage = { body: "", headline: "结束", id: "closing", kind: "closing", position: 1 };

    const next = splitOverflowPhotoPages([source, closing]);

    expect(next.map((page) => page.id)).toEqual(["source", "source:overflow:1", "closing"]);
    expect(next.map((page) => page.position)).toEqual([0, 1, 2]);
    expect(next[0]).toMatchObject({ body: "保留正文", headline: "保留标题", layout: { backgroundId: "paper" } });
    expect(next[0].layout?.elements.filter((element) => element.type === "image").map((element) => element.id)).toEqual(
      Array.from({ length: 8 }, (_, index) => `photo-${index + 1}`),
    );
    expect(next[0].layout?.elements.find((element) => element.id === "caption")).toBeTruthy();
    expect(next[1]).toMatchObject({ body: "", headline: "", kind: "photo", photoUri: "file:///9.jpg" });
    expect(next[1].layout).not.toHaveProperty("backgroundId");
    expect(next[1].layout?.elements).toEqual([
      expect.objectContaining({ id: "photo-9", crop: { focusX: 0.9, focusY: 0.5, zoom: 1.9 } }),
      expect.objectContaining({ id: "photo-10", crop: { focusX: 1, focusY: 0.5, zoom: 2 } }),
      expect.objectContaining({ id: "photo-11", crop: { focusX: 1.1, focusY: 0.5, zoom: 2.1 } }),
      expect.objectContaining({ id: "photo-12", crop: { focusX: 1.2, focusY: 0.5, zoom: 2.2 } }),
    ]);
    expect(source.layout?.elements).toHaveLength(13);
  });

  it("returns the original list when every page is within the limit", () => {
    const pages: StoryPage[] = [{ body: "", headline: "", id: "safe", kind: "photo", position: 0, layout: { aspectRatio: 0.75, elements: [image(1)] } }];
    expect(splitOverflowPhotoPages(pages)).toBe(pages);
  });
});
