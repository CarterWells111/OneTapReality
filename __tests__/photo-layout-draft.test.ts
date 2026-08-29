import {
  movePhotoLayoutDraftItem,
  removePhotoLayoutDraftItem,
  resolveTemplateAfterPhotoCountChange,
} from "../src/features/canvas/photo-layout-draft";

const photos = [
  { id: "one", uri: "file:///one.jpg" },
  { id: "two", uri: "file:///two.jpg" },
  { id: "three", uri: "file:///three.jpg" },
];

describe("photo layout draft", () => {
  it("moves and removes stable photo items without confusing duplicate uris", () => {
    const duplicate = [{ ...photos[0], uri: "file:///same.jpg" }, { ...photos[1], uri: "file:///same.jpg" }];

    expect(movePhotoLayoutDraftItem(duplicate, "two", 0).map((photo) => photo.id)).toEqual(["two", "one"]);
    expect(removePhotoLayoutDraftItem(duplicate, "one").map((photo) => photo.id)).toEqual(["two"]);
  });

  it("keeps the selected template family as the photo count changes", () => {
    expect(resolveTemplateAfterPhotoCountChange("magazine-2", 3)).toBe("magazine-3");
    expect(resolveTemplateAfterPhotoCountChange("magazine-3", 6)).toBeUndefined();
    expect(resolveTemplateAfterPhotoCountChange(undefined, 2, "magazine")).toBe("magazine-2");
  });
});
