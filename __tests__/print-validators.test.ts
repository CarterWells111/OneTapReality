import { printSpecs, safeAreaOf } from "../src/features/print/print-spec";
import {
  isWithinSafeArea,
  validateAlbumForPrint,
  validatePageCount,
  validatePhotoPlaceholders,
} from "../src/features/print/validators";
import type { CanvasImageElement, StoryPage } from "../src/types/memory";

const square = printSpecs.square;
const a5 = printSpecs.a5;

function imageElement(overrides: Partial<CanvasImageElement> = {}): CanvasImageElement {
  return {
    id: "img-1",
    type: "image",
    uri: "file://photo.jpg",
    x: 0.2,
    y: 0.2,
    width: 0.5,
    height: 0.5,
    rotation: 0,
    zIndex: 0,
    ...overrides,
  };
}

function photoPage(overrides: Partial<StoryPage> = {}): StoryPage {
  return {
    id: "photo-1",
    position: 1,
    kind: "photo",
    headline: "照片页",
    body: "",
    photoUri: "file://photo.jpg",
    ...overrides,
  };
}

describe("printSpecs", () => {
  it("supports square and a5 formats", () => {
    expect(square.pageWidthMm).toBe(square.pageHeightMm);
    expect(a5.pageWidthMm).toBe(148);
    expect(a5.pageHeightMm).toBe(210);
  });
});

describe("isWithinSafeArea (边界测试)", () => {
  const safe = safeAreaOf(square);

  it("accepts a box exactly on the safe-area boundary", () => {
    expect(
      isWithinSafeArea(
        { x: safe.x, y: safe.y, width: safe.width, height: safe.height },
        square
      )
    ).toBe(true);
  });

  it("rejects a box that crosses the left margin by a hair", () => {
    expect(
      isWithinSafeArea(
        { x: safe.x - 0.001, y: safe.y, width: safe.width, height: safe.height },
        square
      )
    ).toBe(false);
  });

  it("rejects a box that overflows the bottom edge", () => {
    expect(
      isWithinSafeArea({ x: 0.5, y: 0.9, width: 0.2, height: 0.2 }, square)
    ).toBe(false);
  });

  it("uses per-axis margins for the non-square a5 format", () => {
    const a5Safe = safeAreaOf(a5);
    expect(a5Safe.x).toBeCloseTo(8 / 148);
    expect(a5Safe.y).toBeCloseTo(8 / 210);
  });
});

describe("validatePageCount (边界测试)", () => {
  it("accepts min and max exactly", () => {
    expect(validatePageCount(square.minPages, square)).toEqual([]);
    expect(validatePageCount(square.maxPages, square)).toEqual([]);
  });

  it("rejects one below min and one above max", () => {
    expect(validatePageCount(square.minPages - 1, square)).toEqual([
      { type: "page-count-too-low", actual: square.minPages - 1, min: square.minPages },
    ]);
    expect(validatePageCount(square.maxPages + 1, square)).toEqual([
      { type: "page-count-too-high", actual: square.maxPages + 1, max: square.maxPages },
    ]);
  });

  it("rejects an empty album", () => {
    expect(validatePageCount(0, square)[0]?.type).toBe("page-count-too-low");
  });
});

describe("validatePhotoPlaceholders", () => {
  it("flags photo pages without a photo", () => {
    const missing = photoPage({ id: "photo-2", photoUri: undefined });

    expect(validatePhotoPlaceholders([photoPage(), missing])).toEqual([
      { type: "missing-photo", pageId: "photo-2" },
    ]);
  });

  it("does not require photos on cover or closing pages", () => {
    const cover: StoryPage = { id: "cover", position: 0, kind: "cover", headline: "封面", body: "" };

    expect(validatePhotoPlaceholders([cover])).toEqual([]);
  });
});

describe("validateAlbumForPrint", () => {
  const cover: StoryPage = { id: "cover", position: 0, kind: "cover", headline: "封面", body: "" };
  const closing: StoryPage = { id: "closing", position: 2, kind: "closing", headline: "封底", body: "" };

  it("passes a well-formed album", () => {
    const album = [cover, photoPage(), closing];

    expect(validateAlbumForPrint(album, square)).toEqual({ ok: true, issues: [] });
  });

  it("collects safe-area issues from page layouts", () => {
    const outside = photoPage({
      layout: {
        aspectRatio: 1,
        elements: [imageElement({ id: "img-out", x: 0.99, width: 0.5 })],
      },
    });

    const result = validateAlbumForPrint([cover, outside, closing], square);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      type: "out-of-safe-area",
      pageId: "photo-1",
      elementId: "img-out",
    });
  });

  it("skips safe-area checks for legacy pages without layout", () => {
    const result = validateAlbumForPrint([cover, photoPage(), closing], square);

    expect(result.issues.filter((issue) => issue.type === "out-of-safe-area")).toEqual([]);
  });
});
