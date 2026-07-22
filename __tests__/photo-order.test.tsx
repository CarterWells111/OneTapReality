import { fireEvent, render } from "@testing-library/react-native";

import {
  appendUniquePhotoUris,
  movePhotoUri,
  removePhotoUri,
} from "../src/features/photos/photo-order";
import { PhotoStrip } from "../src/components/photo-strip";

describe("photo URI ordering", () => {
  it("keeps first-seen URI order while removing duplicates", () => {
    expect(appendUniquePhotoUris(["file://one"], ["file://two", "file://one", "file://three"])).toEqual([
      "file://one",
      "file://two",
      "file://three",
    ]);
  });

  it("keeps an empty or single-photo collection stable", () => {
    expect(removePhotoUri([], 0)).toEqual([]);
    expect(movePhotoUri(["file://only"], 0, 1)).toEqual(["file://only"]);
  });

  it("removes and moves photos without mutating the input", () => {
    const uris = ["file://one", "file://two", "file://three"];

    expect(removePhotoUri(uris, 1)).toEqual(["file://one", "file://three"]);
    expect(movePhotoUri(uris, 2, -1)).toEqual(["file://one", "file://three", "file://two"]);
    expect(uris).toEqual(["file://one", "file://two", "file://three"]);
  });
});

describe("PhotoStrip", () => {
  it("reports the reordered URI list when a user moves a photo", async () => {
    const onChange = jest.fn();
    const view = await render(
      <PhotoStrip photoUris={["file://one", "file://two"]} onChange={onChange} />
    );

    fireEvent.press(view.getByLabelText("后移照片 1"));

    expect(onChange).toHaveBeenCalledWith(["file://two", "file://one"]);
  });
});
