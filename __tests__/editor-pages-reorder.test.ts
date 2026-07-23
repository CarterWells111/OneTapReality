import {
  deleteCanvasPages,
  reorderCanvasPages,
} from "../src/features/canvas/editor-pages";
import type { StoryPage } from "../src/types/memory";

const pages: StoryPage[] = [
  { id: "a", position: 0, kind: "cover", headline: "A", body: "" },
  { id: "b", position: 1, kind: "photo", headline: "B", body: "" },
  { id: "c", position: 2, kind: "closing", headline: "C", body: "" },
];

describe("reorderCanvasPages", () => {
  it("moves a page and renumbers positions", () => {
    const next = reorderCanvasPages(pages, 0, 2);
    expect(next.map((page) => page.id)).toEqual(["b", "c", "a"]);
    expect(next.map((page) => page.position)).toEqual([0, 1, 2]);
  });

  it("returns a normalized copy for out-of-range or no-op moves", () => {
    expect(reorderCanvasPages(pages, 1, 1).map((page) => page.id)).toEqual(["a", "b", "c"]);
    expect(reorderCanvasPages(pages, -1, 2).map((page) => page.id)).toEqual(["a", "b", "c"]);
  });
});

describe("deleteCanvasPages", () => {
  it("removes selected pages and keeps positions contiguous", () => {
    const next = deleteCanvasPages(pages, ["b"]);
    expect(next.map((page) => page.id)).toEqual(["a", "c"]);
    expect(next.map((page) => page.position)).toEqual([0, 1]);
  });

  it("never deletes the last remaining page", () => {
    const next = deleteCanvasPages(pages, ["a", "b", "c"]);
    expect(next).toHaveLength(3);
  });
});
