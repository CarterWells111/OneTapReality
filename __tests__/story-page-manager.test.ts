import {
  addStoryPage,
  moveStoryPage,
  normalizeStoryPages,
  removeStoryPage,
} from "../src/features/pages/story-page-manager";
import type { StoryPage } from "../src/types/memory";

function page(id: string, position: number, kind: StoryPage["kind"] = "photo"): StoryPage {
  return { id, position, kind, headline: `页 ${id}`, body: "" };
}

describe("normalizeStoryPages", () => {
  it("sorts by position and renumbers to a continuous 0..n-1 sequence", () => {
    const result = normalizeStoryPages([page("b", 7), page("a", 2), page("c", 11)]);

    expect(result.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(result.map((item) => item.position)).toEqual([0, 1, 2]);
  });

  it("does not mutate the input list", () => {
    const input = [page("b", 5), page("a", 1)];
    normalizeStoryPages(input);

    expect(input.map((item) => item.position)).toEqual([5, 1]);
  });
});

describe("addStoryPage", () => {
  it("appends to the end by default", () => {
    const result = addStoryPage([page("cover", 0, "cover")], {
      id: "photo-1",
      kind: "photo",
      headline: "新的一页",
    });

    expect(result.map((item) => item.id)).toEqual(["cover", "photo-1"]);
    expect(result.map((item) => item.position)).toEqual([0, 1]);
  });

  it("inserts at the requested index", () => {
    const result = addStoryPage(
      [page("cover", 0, "cover"), page("closing", 1, "closing")],
      { id: "photo-1", kind: "photo" },
      1
    );

    expect(result.map((item) => item.id)).toEqual(["cover", "photo-1", "closing"]);
    expect(result.map((item) => item.position)).toEqual([0, 1, 2]);
  });

  it("clamps an out-of-range insert index", () => {
    const result = addStoryPage([page("cover", 0, "cover")], { id: "x", kind: "photo" }, 99);

    expect(result.map((item) => item.id)).toEqual(["cover", "x"]);
  });

  it("rejects a duplicate id and returns the normalized original list", () => {
    const result = addStoryPage([page("cover", 3, "cover")], { id: "cover", kind: "photo" });

    expect(result).toEqual([{ ...page("cover", 0, "cover") }]);
  });
});

describe("removeStoryPage", () => {
  it("removes a middle page and renumbers the rest", () => {
    const result = removeStoryPage(
      [page("cover", 0, "cover"), page("photo-1", 1), page("closing", 2, "closing")],
      "photo-1"
    );

    expect(result.map((item) => item.id)).toEqual(["cover", "closing"]);
    expect(result.map((item) => item.position)).toEqual([0, 1]);
  });

  it("refuses to produce an empty page sequence", () => {
    const only = page("cover", 0, "cover");
    const result = removeStoryPage([only], "cover");

    expect(result).toEqual([only]);
  });

  it("ignores an unknown id", () => {
    const result = removeStoryPage([page("cover", 0, "cover")], "missing");

    expect(result.map((item) => item.id)).toEqual(["cover"]);
  });
});

describe("moveStoryPage", () => {
  const pages = [page("a", 0), page("b", 1), page("c", 2)];

  it("moves a page down one slot", () => {
    const result = moveStoryPage(pages, "a", 1);

    expect(result.map((item) => item.id)).toEqual(["b", "a", "c"]);
    expect(result.map((item) => item.position)).toEqual([0, 1, 2]);
  });

  it("moves a page up one slot", () => {
    const result = moveStoryPage(pages, "c", -1);

    expect(result.map((item) => item.id)).toEqual(["a", "c", "b"]);
  });

  it("keeps order when moving the first page up", () => {
    const result = moveStoryPage(pages, "a", -1);

    expect(result.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps order when moving the last page down", () => {
    const result = moveStoryPage(pages, "c", 1);

    expect(result.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps order for an unknown id", () => {
    const result = moveStoryPage(pages, "missing", 1);

    expect(result.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });
});
