import {
  addImageToPage,
  addStickerToPage,
  addTextToPage,
  applyPhotoTemplateToPage,
  deleteCanvasElement,
  duplicateCanvasElement,
  preserveLayoutMeta,
  replacePagePhotos,
  setCanvasBackground,
  setCanvasCoverColor,
  setCanvasCoverImage,
  updateCanvasElement,
} from "../src/features/canvas/editor-pages";
import { resolvePhotoTemplate } from "../src/features/canvas/photo-templates";
import type { CanvasElement, CanvasLayout, StoryPage } from "../src/types/memory";

const image = (id: string, uri: string, zIndex: number, offset = 0): CanvasElement => ({
  id,
  type: "image",
  uri,
  x: 0.01 + offset,
  y: 0.02 + offset,
  width: 0.3,
  height: 0.25,
  rotation: offset,
  zIndex,
});

const pageWithPhotos = (count: number, templateId?: string): StoryPage => ({
  id: "page-1",
  position: 0,
  kind: "photo",
  headline: "旅行",
  body: "记忆",
  layout: {
    aspectRatio: 0.75,
    schemaVersion: 7,
    customMeta: { source: "editor-test" },
    backgroundId: "paper",
    coverColor: "#123456",
    coverImage: "file:///cover.jpg",
    ...(templateId ? { photoTemplateId: templateId as CanvasLayout["photoTemplateId"] } : {}),
    elements: [
      ...Array.from({ length: count }, (_, index) => image(`old-${index + 1}`, `file:///old-${index + 1}.jpg`, count - index, index / 100)),
      { id: "caption", type: "text", text: "保留文字", fontStyle: "System", color: "#111111", fontSize: 16, x: 0.1, y: 0.8, width: 0.8, height: 0.1, rotation: 0, zIndex: 10 },
      { id: "sticker", type: "sticker", stickerId: "sticker1-01", x: 0.7, y: 0.7, width: 0.2, height: 0.2, rotation: 0, zIndex: 11 },
    ],
  } as CanvasLayout,
});

describe("editor photo templates", () => {
  it("preserves arbitrary layout metadata only with an explicit preserve mode", () => {
    const previous = pageWithPhotos(1).layout!;
    const nextItems = previous.elements.filter((element) => element.type !== "image");

    expect(preserveLayoutMeta(previous, nextItems, "preserve")).toMatchObject({
      schemaVersion: 7,
      customMeta: { source: "editor-test" },
      backgroundId: "paper",
      coverColor: "#123456",
      coverImage: "file:///cover.jpg",
    });
    expect(preserveLayoutMeta(previous, nextItems, "clear")).not.toHaveProperty("photoTemplateId");
    expect(preserveLayoutMeta(previous, nextItems, "classic-1")).toMatchObject({ photoTemplateId: "classic-1" });
  });

  it("applies exact template slots by ascending z-order without changing image identity or non-images", () => {
    const pages = [pageWithPhotos(2)];
    const original = structuredClone(pages);
    const next = applyPhotoTemplateToPage(pages, "page-1", "magazine-2");
    const nextPage = next[0];
    const photos = nextPage.layout!.elements.filter((element) => element.type === "image").sort((left, right) => left.zIndex - right.zIndex);

    expect(photos).toEqual([
      expect.objectContaining({ id: "old-2", uri: "file:///old-2.jpg", zIndex: 1, x: 0.08, y: 0.09, width: 0.52, height: 0.82, rotation: 0 }),
      expect.objectContaining({ id: "old-1", uri: "file:///old-1.jpg", zIndex: 2, x: 0.64, y: 0.18, width: 0.28, height: 0.57, rotation: 0 }),
    ]);
    expect(nextPage.layout).toMatchObject({ photoTemplateId: "magazine-2", schemaVersion: 7, customMeta: { source: "editor-test" } });
    expect(nextPage.layout!.elements.find((element) => element.id === "caption")).toEqual(original[0].layout!.elements.find((element) => element.id === "caption"));
    expect(nextPage.layout!.elements.find((element) => element.id === "sticker")).toEqual(original[0].layout!.elements.find((element) => element.id === "sticker"));
    expect(pages).toEqual(original);
  });

  it("safely no-ops for missing pages, unknown templates, and count mismatches", () => {
    const pages = [pageWithPhotos(2)];
    expect(applyPhotoTemplateToPage(pages, "missing", "classic-2")).toBe(pages);
    expect(applyPhotoTemplateToPage(pages, "page-1", "not-a-template")).toBe(pages);
    expect(applyPhotoTemplateToPage(pages, "page-1", "classic-1")).toBe(pages);
  });

  it.each([1, 2, 3] as const)("replaces %s photos using a matching template and preserves non-images", (count) => {
    const pages = [pageWithPhotos(count, "classic-1")];
    const photos = Array.from({ length: count }, (_, index) => ({ id: `new-${index + 1}`, uri: `file:///new-${index + 1}.jpg` }));
    const next = replacePagePhotos(pages, "page-1", photos, `columns-${count}`);
    const nextPage = next[0];
    const actualPhotos = nextPage.layout!.elements.filter((element) => element.type === "image");

    expect(actualPhotos.map((photo) => ({ id: photo.id, uri: photo.uri, zIndex: photo.zIndex }))).toEqual(
      photos.map((photo, index) => ({ ...photo, zIndex: index + 1 })),
    );
    const slots = resolvePhotoTemplate(`columns-${count}`)!.slots;
    expect(actualPhotos.map((photo) => [photo.x, photo.y, photo.width, photo.height, photo.rotation])).toEqual(
      slots.map((slot) => [slot.x, slot.y, slot.width, slot.height, slot.rotation]),
    );
    expect(nextPage.layout).toMatchObject({ photoTemplateId: `columns-${count}`, backgroundId: "paper", schemaVersion: 7 });
    expect(nextPage.layout!.elements.filter((element) => element.type !== "image").map((element) => element.id)).toEqual(["caption", "sticker"]);
  });

  it("uses freeform layout and clears the template for four or more photos or invalid template input", () => {
    const pages = [pageWithPhotos(2, "classic-2")];
    const photos = Array.from({ length: 13 }, (_, index) => ({ id: `new-${index + 1}`, uri: `file:///new-${index + 1}.jpg` }));
    const next = replacePagePhotos(pages, "page-1", photos, "classic-2");
    const actualPhotos = next[0].layout!.elements.filter((element) => element.type === "image");

    expect(actualPhotos).toHaveLength(12);
    expect(actualPhotos.map((photo) => photo.id)).toEqual(Array.from({ length: 12 }, (_, index) => `new-${index + 1}`));
    expect(next[0].layout).not.toHaveProperty("photoTemplateId");

    const invalid = replacePagePhotos(pages, "page-1", [{ id: "new", uri: "file:///new.jpg" }], "unknown-template");
    expect(invalid[0].layout).not.toHaveProperty("photoTemplateId");
    expect(invalid[0].layout!.elements.find((element) => element.type === "image")).toMatchObject({ id: "new", x: 0.08, y: 0.08, width: 0.84, height: 0.84 });
  });

  it("clears a page template for image membership or manual geometry mutations", () => {
    const base = [pageWithPhotos(2, "classic-2")];
    expect(addImageToPage(base, "page-1", "added", "file:///added.jpg")[0].layout).not.toHaveProperty("photoTemplateId");
    expect(duplicateCanvasElement(base, "page-1", "old-1", "copy")[0].layout).not.toHaveProperty("photoTemplateId");
    expect(deleteCanvasElement(base, "page-1", "old-1")[0].layout).not.toHaveProperty("photoTemplateId");
    expect(updateCanvasElement(base, "page-1", "old-1", { uri: "file:///changed.jpg" })[0].layout).toHaveProperty("photoTemplateId", "classic-2");
    expect(updateCanvasElement(base, "page-1", "old-1", { x: 0.22 })[0].layout).not.toHaveProperty("photoTemplateId");
    expect(updateCanvasElement(base, "page-1", "old-1", { rotation: 2 })[0].layout).not.toHaveProperty("photoTemplateId");
  });

  it("synchronizes the legacy top-level photo URI when replacing page photos", () => {
    const pages = [{ ...pageWithPhotos(2, "classic-2"), photoUri: "file:///old-legacy.jpg" }];
    const replaced = replacePagePhotos(pages, "page-1", [{ id: "new", uri: "file:///new.jpg" }], "classic-1");
    expect(replaced[0].photoUri).toBe("file:///new.jpg");
    expect(replaced[0].photoUri).not.toBe("file:///old-legacy.jpg");

    const cleared = replacePagePhotos(pages, "page-1", [], undefined);
    expect(cleared[0]).not.toHaveProperty("photoUri");
  });

  it("preserves a page template for non-image edits and cover/background changes", () => {
    const base = [pageWithPhotos(2, "classic-2")];
    expect(addTextToPage(base, "page-1", "text-2")[0].layout).toHaveProperty("photoTemplateId", "classic-2");
    expect(addStickerToPage(base, "page-1", "sticker-2", "sticker1-02")[0].layout).toHaveProperty("photoTemplateId", "classic-2");
    expect(updateCanvasElement(base, "page-1", "caption", { x: 0.2, text: "新文字" })[0].layout).toHaveProperty("photoTemplateId", "classic-2");
    expect(setCanvasBackground(base, "page-1", "linen")[0].layout).toHaveProperty("photoTemplateId", "classic-2");
    expect(setCanvasCoverColor(base, "page-1", "#FFFFFF")[0].layout).toHaveProperty("photoTemplateId", "classic-2");
    expect(setCanvasCoverImage(base, "page-1", "file:///new-cover.jpg")[0].layout).toHaveProperty("photoTemplateId", "classic-2");
    expect(deleteCanvasElement(base, "page-1", "caption")[0].layout).toHaveProperty("photoTemplateId", "classic-2");
    expect(duplicateCanvasElement(base, "page-1", "caption", "caption-copy")[0].layout).toHaveProperty("photoTemplateId", "classic-2");
  });

  it("omits cleared background and cover values while preserving the template", () => {
    const base = [pageWithPhotos(2, "classic-2")];
    const backgroundCleared = setCanvasBackground(base, "page-1", undefined)[0];
    expect(backgroundCleared.layout).not.toHaveProperty("backgroundId");
    expect(backgroundCleared.layout).toHaveProperty("photoTemplateId", "classic-2");

    const colorCleared = setCanvasCoverColor(base, "page-1", undefined)[0];
    expect(colorCleared).not.toHaveProperty("coverColor");
    expect(colorCleared.layout).not.toHaveProperty("coverColor");
    expect(colorCleared.layout).toHaveProperty("photoTemplateId", "classic-2");

    const imageCleared = setCanvasCoverImage(base, "page-1", undefined)[0];
    expect(imageCleared).not.toHaveProperty("coverImage");
    expect(imageCleared.layout).not.toHaveProperty("coverImage");
    expect(imageCleared.layout).toHaveProperty("photoTemplateId", "classic-2");
  });

  it("keeps unrelated pages and all input snapshots immutable", () => {
    const first = pageWithPhotos(2, "classic-2");
    const second = { ...pageWithPhotos(1, "classic-1"), id: "page-2", position: 1 };
    const pages = [first, second];
    const original = structuredClone(pages);
    const photos = [{ id: "replacement", uri: "file:///replacement.jpg" }];

    const next = replacePagePhotos(pages, "page-1", photos, "magazine-1");

    expect(next[1]).toEqual(original[1]);
    expect(pages).toEqual(original);
    expect(photos).toEqual([{ id: "replacement", uri: "file:///replacement.jpg" }]);
  });

  it("does not normalize unrelated pages or target non-images during photo layout edits", () => {
    const target = pageWithPhotos(2);
    const targetCaption = target.layout!.elements.find((element) => element.id === "caption");
    target.layout = { ...target.layout!, aspectRatio: 1 };
    const unrelated = { ...pageWithPhotos(1), id: "page-2", position: 1 };
    unrelated.layout = { ...unrelated.layout!, aspectRatio: 1 };
    const pages = [target, unrelated];

    const applied = applyPhotoTemplateToPage(pages, "page-1", "columns-2");
    expect(applied[1]).toBe(unrelated);
    expect(applied[1]).toEqual(unrelated);
    expect(applied[0].layout!.aspectRatio).toBe(1);
    expect(applied[0].layout!.elements.find((element) => element.id === "caption")).toBe(targetCaption);

    const replaced = replacePagePhotos(pages, "page-1", [{ id: "new", uri: "file:///new.jpg" }], "columns-1");
    expect(replaced[1]).toBe(unrelated);
    expect(replaced[1]).toEqual(unrelated);
    expect(replaced[0].layout!.aspectRatio).toBe(1);
    expect(replaced[0].layout!.elements.find((element) => element.id === "caption")).toBe(targetCaption);
  });
});
