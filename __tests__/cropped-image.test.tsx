import { fireEvent, render } from "@testing-library/react-native";
import * as React from "react";
import { StyleSheet } from "react-native";

import { CroppedImage } from "../src/features/canvas/cropped-image";

describe("CroppedImage", () => {
  it("renders the same bounded crop geometry from source and viewport dimensions", () => {
    const screen = render(
      <CroppedImage
        crop={{ focusX: 1, focusY: 0.5, zoom: 1 }}
        testID="photo"
        uri="file:///photo.jpg"
      />,
    );

    fireEvent(screen.getByTestId("photo"), "layout", { nativeEvent: { layout: { height: 100, width: 100 } } });
    fireEvent(screen.getByTestId("photo-content"), "load", {
      nativeEvent: { source: { height: 200, width: 400 } },
    });

    expect(screen.getByTestId("photo-content").props.source).toEqual([{ uri: "file:///photo.jpg" }]);
    expect(StyleSheet.flatten(screen.getByTestId("photo-content").props.style)).toEqual(expect.objectContaining({
      height: 100,
      left: -100,
      position: "absolute",
      top: 0,
      width: 200,
    }));
  });
});
