import { fireEvent, render } from "@testing-library/react-native";
import * as React from "react";
import { getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { StyleSheet } from "react-native";

import { PhotoCropModal } from "../src/features/canvas/photo-crop-modal";

describe("PhotoCropModal", () => {
  it("uses the requested frame ratio and confirms a reset crop", () => {
    const onConfirm = jest.fn();
    const screen = render(
      <PhotoCropModal
        aspectRatio={3 / 4}
        crop={{ focusX: 0.1, focusY: 0.9, zoom: 3 }}
        onCancel={() => undefined}
        onConfirm={onConfirm}
        uri="file:///photo.jpg"
      />,
    );

    expect(StyleSheet.flatten(screen.getByTestId("photo-crop-frame").props.style)).toEqual(expect.objectContaining({ aspectRatio: 3 / 4 }));
    fireEvent.press(screen.getByLabelText("重置裁剪"));
    fireEvent.press(screen.getByLabelText("完成裁剪"));

    expect(onConfirm).toHaveBeenCalledWith({ focusX: 0.5, focusY: 0.5, zoom: 1 });
  });

  it("keeps UI-thread crop geometry instead of resetting a temporary transform on release", () => {
    const screen = render(
      <PhotoCropModal aspectRatio={3 / 4} onCancel={() => undefined} onConfirm={() => undefined} uri="file:///photo.jpg" />,
    );
    const pan = getByGestureTestId("photo-crop-pan") as unknown as {
      handlers: { onEnd?: unknown; onFinalize?: unknown; onUpdate?: unknown };
    };

    expect(pan.handlers.onUpdate).toEqual(expect.any(Function));
    expect(pan.handlers.onEnd).toBeUndefined();
    expect(pan.handlers.onFinalize).toEqual(expect.any(Function));
    expect(StyleSheet.flatten(screen.getByTestId("photo-crop-image-layer").props.style)).not.toHaveProperty("transform");
  });

  it("delegates cancellation without changing the crop", () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    const screen = render(
      <PhotoCropModal aspectRatio={1} onCancel={onCancel} onConfirm={onConfirm} uri="file:///photo.jpg" />,
    );

    fireEvent.press(screen.getByLabelText("取消裁剪"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
