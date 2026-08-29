import { collectMemoryImageUris, pageImageUris } from "../src/features/gifts/page-media";
import type { StoryPage } from "../src/types/memory";

describe("gift page media derivation", () => {
  it("collects every layout image in stable first-seen order with legacy fallback and deduplication", () => {
    const page: StoryPage = {
      id: "page-1",
      position: 0,
      kind: "photo",
      headline: "Trip",
      body: "",
      photoUri: "file:///legacy.jpg",
      layout: {
        aspectRatio: 0.75,
        elements: [
          { id: "one", type: "image", uri: "file:///one.jpg", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 1 },
          { id: "duplicate", type: "image", uri: "file:///legacy.jpg", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 2 },
          { id: "two", type: "image", uri: "file:///two.jpg", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 3 },
        ],
      },
    };

    expect(pageImageUris(page)).toEqual(["file:///one.jpg", "file:///legacy.jpg", "file:///two.jpg"]);
    expect(collectMemoryImageUris([page, { ...page, id: "page-2", position: 1, photoUri: "file:///two.jpg" }])).toEqual([
      "file:///one.jpg", "file:///legacy.jpg", "file:///two.jpg",
    ]);
  });

  it("uses the legacy URI only for pages without layout images", () => {
    const legacy: StoryPage = { id: "legacy", position: 0, kind: "photo", headline: "", body: "", photoUri: "file:///legacy.jpg" };
    expect(pageImageUris(legacy)).toEqual(["file:///legacy.jpg"]);
  });

  it("does not fall back to legacy media when a layout owns an image slot", () => {
    const page: StoryPage = {
      id: "layout", position: 0, kind: "photo", headline: "", body: "", photoUri: "file:///stale.jpg",
      layout: { aspectRatio: 0.75, elements: [{ id: "image", type: "image", uri: "", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 1 }] },
    };
    expect(pageImageUris(page)).toEqual([]);
  });
});
