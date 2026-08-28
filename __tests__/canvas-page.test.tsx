import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import type { SharedValue } from "react-native-reanimated";

import { CanvasPage } from "../src/features/canvas/canvas-page";
import { CanvasToolbar } from "../src/features/canvas/canvas-toolbar";
import type { CanvasImageElement, CanvasLayout, CanvasTextElement } from "../src/types/memory";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../src/features/canvas/selection-handles", () => {
  const { Pressable } = jest.requireActual("react-native");
  return {
    SelectionHandles: ({ onHandleDragEnd, onHandleDragStart }: { onHandleDragEnd: (generation: number) => void; onHandleDragStart: () => void }) => (
      <>
        <Pressable onPress={onHandleDragStart} testID="begin-canvas-handle-transform" />
        <Pressable onPress={() => onHandleDragEnd(0)} testID="commit-canvas-transform" />
      </>
    ),
  };
});

const layout: CanvasLayout = {
  aspectRatio: 1,
  backgroundId: "background-01",
  elements: [
    { id: "photo-1", type: "image", uri: "file://lake.jpg", x: 0.08, y: 0.08, width: 0.84, height: 0.5, rotation: 0, zIndex: 1 },
    { id: "caption-1", type: "text", text: "Lake side", fontStyle: "system", color: "#1C2C28", fontSize: 16, x: 0.1, y: 0.65, width: 0.8, height: 0.1, rotation: 0, zIndex: 2 },
    { id: "sticker-1", type: "sticker", stickerId: "sticker1-01", x: 0.72, y: 0.78, width: 0.12, height: 0.12, rotation: 0, zIndex: 3 },
  ],
};

describe("CanvasPage", () => {
  it("renders saved crop metadata for page photos and cover backgrounds", () => {
    const croppedLayout: CanvasLayout = {
      ...layout,
      backgroundId: undefined,
      coverImage: "file://cover.jpg",
      coverCrop: { focusX: 0, focusY: 0.5, zoom: 1 },
      elements: [{
        ...(layout.elements[0] as CanvasImageElement),
        crop: { focusX: 1, focusY: 0.5, zoom: 1 },
      }],
    };
    const screen = render(<CanvasPage interactive={false} layout={croppedLayout} width={300} />);

    fireEvent(screen.getByTestId("canvas-image-photo-1-viewport"), "layout", {
      nativeEvent: { layout: { height: 100, width: 100 } },
    });
    fireEvent(screen.getByTestId("canvas-image-photo-1"), "load", {
      nativeEvent: { source: { height: 200, width: 400 } },
    });
    fireEvent(screen.getByTestId("canvas-cover-image-viewport"), "layout", {
      nativeEvent: { layout: { height: 100, width: 100 } },
    });
    fireEvent(screen.getByTestId("canvas-cover-image"), "load", {
      nativeEvent: { source: { height: 200, width: 400 } },
    });

    expect(StyleSheet.flatten(screen.getByTestId("canvas-image-photo-1").props.style)).toEqual(expect.objectContaining({ left: -100 }));
    expect(StyleSheet.flatten(screen.getByTestId("canvas-cover-image").props.style)).toEqual(expect.objectContaining({ left: 0 }));
  });

  it("renders a local missing-photo placeholder instead of mounting a layout cover image", () => {
    const screen = render(<CanvasPage interactive={false} layout={{ aspectRatio: 0.75, coverImage: "missing-local-photo://layout-cover", elements: [] }} width={300} />);

    expect(screen.getByLabelText("本地照片缺失")).toBeTruthy();
    expect(screen.queryByTestId("canvas-cover-image")).toBeNull();
  });

  it("renders elements and selects an interactive element only after a double press", () => {
    const onSelect = jest.fn();
    const screen = render(<CanvasPage layout={layout} selectedElementId="caption-1" onSelectElement={onSelect} />);

    expect(screen.getByTestId("canvas-image-photo-1")).toBeTruthy();
    expect(screen.getByTestId("canvas-background-background-01")).toBeTruthy();
    expect(screen.getByText("Lake side")).toBeTruthy();
    expect(screen.getByTestId("canvas-sticker-sticker-1")).toBeTruthy();

    fireEvent.press(screen.getByTestId("canvas-element-sticker-1"));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("canvas-element-sticker-1"));
    expect(onSelect).toHaveBeenCalledWith("sticker-1");
  });

  it("shows a crop control beside a selected photo and flips it above near the page edge", () => {
    const onCropElement = jest.fn();
    const bottomPhoto = { ...(layout.elements[0] as CanvasImageElement), y: 0.82, height: 0.16 };
    const screen = render(
      <CanvasPage layout={{ ...layout, elements: [bottomPhoto] }} onCropElement={onCropElement} selectedElementId="photo-1" />,
    );

    expect(StyleSheet.flatten(screen.getByLabelText("裁剪照片").props.style)).toEqual(expect.objectContaining({ bottom: "100%" }));
    fireEvent.press(screen.getByLabelText("裁剪照片"));
    expect(onCropElement).toHaveBeenCalledWith("photo-1");
  });

  it("selects a cover on double press and exposes its crop control inside the lower edge", () => {
    const onSelectCover = jest.fn();
    const onCropCover = jest.fn();
    const coverLayout = { ...layout, backgroundId: undefined, coverImage: "file:///cover.jpg", elements: [] };
    const screen = render(
      <CanvasPage coverSelected layout={coverLayout} onCropCover={onCropCover} onSelectCover={onSelectCover} />,
    );

    fireEvent.press(screen.getByTestId("album-canvas"));
    fireEvent.press(screen.getByTestId("album-canvas"));
    expect(onSelectCover).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText("裁剪封面照片"));
    expect(onCropCover).toHaveBeenCalledTimes(1);
    expect(StyleSheet.flatten(screen.getByLabelText("裁剪封面照片").props.style)).toEqual(expect.objectContaining({ bottom: 10 }));
  });

  it("keeps saved geometry in a read-only 3:4 preview", () => {
    const transformed: CanvasLayout = { ...layout, elements: [{ ...layout.elements[0], x: 0.2, y: 0.25, width: 0.5, height: 0.3, rotation: 0.42 }] };
    const screen = render(<CanvasPage displayAspectRatio={3 / 4} interactive={false} layout={transformed} width={300} />);

    expect(StyleSheet.flatten(screen.getByTestId("album-canvas").props.style)).toMatchObject({ height: 400, width: 300 });
    expect(StyleSheet.flatten(screen.getByTestId("canvas-element-frame-photo-1").props.style)).toMatchObject({
      height: 120, left: 60, top: 100, width: 150, transform: [{ rotate: "0.42rad" }], zIndex: 1,
    });
  });

  it("scales text metrics with a read-only thumbnail while preserving normalized geometry", () => {
    const screen = render(
      <CanvasPage contentScale={0.5} interactive={false} layout={layout} width={150} height={200} />,
    );

    expect(StyleSheet.flatten(screen.getByTestId("canvas-element-frame-caption-1").props.style)).toMatchObject({
      height: 20,
      left: 15,
      top: 130,
      width: 120,
    });
    expect(StyleSheet.flatten(screen.getByText("Lake side").props.style)).toMatchObject({
      fontSize: 8,
      lineHeight: 10,
      paddingHorizontal: 2,
      paddingVertical: 1,
    });
  });

  it("consumes shared text and cover previews without changing saved layout", () => {
    const color = { value: "#123456" } as SharedValue<string>;
    const fontSize = { value: 28 } as SharedValue<number>;
    const coverColor = { value: "#654321" } as SharedValue<string>;
    const coverLayout = { ...layout, backgroundId: undefined, coverColor: "#EFE2CF" };
    const screen = render(
      <CanvasPage
        coverColorPreview={coverColor}
        layout={coverLayout}
        selectedElementId="caption-1"
        stylePreview={{ color, elementId: "caption-1", fontSize }}
      />,
    );

    expect(StyleSheet.flatten(screen.getByText("Lake side").props.style)).toMatchObject({
      color: "#123456",
      fontSize: 28,
    });
    expect(StyleSheet.flatten(screen.getByTestId("canvas-cover-color-preview").props.style)).toMatchObject({
      backgroundColor: "#654321",
    });
    expect(coverLayout.coverColor).toBe("#EFE2CF");
    expect((coverLayout.elements[1] as CanvasTextElement).color).toBe("#1C2C28");
  });

  it("uses the same saved base frame in interactive and read-only modes", () => {
    const transformed: CanvasLayout = { ...layout, elements: [{ ...layout.elements[0], x: -0.2, y: 0.25, width: 0.5, height: 0.3, rotation: 0.42, zIndex: 7 }] };
    const interactiveScreen = render(<CanvasPage interactive layout={transformed} width={300} />);
    const interactiveFrame = StyleSheet.flatten(interactiveScreen.getByTestId("canvas-element-frame-photo-1").props.style);
    interactiveScreen.unmount();

    const readOnlyScreen = render(<CanvasPage interactive={false} layout={transformed} width={300} />);
    const readOnlyFrame = StyleSheet.flatten(readOnlyScreen.getByTestId("canvas-element-frame-photo-1").props.style);

    expect(interactiveFrame).toMatchObject({
      height: 120,
      left: -60,
      top: 100,
      width: 150,
      transform: [{ rotate: "0.42rad" }],
      zIndex: 7,
    });
    expect(readOnlyFrame).toMatchObject(interactiveFrame);
  });

  it("uses a clipped text content container without consuming selected text width", () => {
    const interactiveScreen = render(<CanvasPage interactive layout={layout} selectedElementId="caption-1" width={300} />);
    const selectedContent = StyleSheet.flatten(interactiveScreen.getByTestId("canvas-element-content-caption-1").props.style);
    const selectionOverlay = interactiveScreen.getByTestId("canvas-element-selection-caption-1");
    const selectionPointerEvents = selectionOverlay.props.pointerEvents;
    const selectionStyle = StyleSheet.flatten(selectionOverlay.props.style);
    interactiveScreen.unmount();

    const readOnlyScreen = render(<CanvasPage interactive={false} layout={layout} width={300} />);
    const readOnlyTextContent = StyleSheet.flatten(readOnlyScreen.getByTestId("canvas-element-content-caption-1").props.style);

    expect(selectedContent).toEqual(readOnlyTextContent);
    expect(selectedContent).toMatchObject({ flex: 1, borderRadius: 8, overflow: "hidden" });
    expect(selectionPointerEvents).toBe("none");
    expect(selectionStyle).toMatchObject({
      borderWidth: 2,
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    });
  });

  it("renders a persisted full-bleed element without shrinking it", () => {
    const fullBleed: CanvasLayout = {
      ...layout,
      elements: [{ ...layout.elements[0], x: 0, y: 0, width: 1, height: 1 }],
    };
    const screen = render(<CanvasPage interactive={false} layout={fullBleed} width={300} />);

    expect(StyleSheet.flatten(screen.getByTestId("canvas-element-frame-photo-1").props.style)).toMatchObject({
      height: 400,
      width: 300,
    });
  });

  it("temporarily elevates the selected interactive element above overlapping higher saved layers", () => {
    const overlapping: CanvasLayout = {
      ...layout,
      elements: [
        { ...layout.elements[0], zIndex: 1 },
        { ...layout.elements[2], x: layout.elements[0].x, y: layout.elements[0].y, zIndex: 50 },
      ],
    };
    const screen = render(<CanvasPage interactive layout={overlapping} selectedElementId="photo-1" width={300} />);

    expect(StyleSheet.flatten(screen.getByTestId("canvas-element-frame-photo-1").props.style).zIndex).toBe(51);
    expect(StyleSheet.flatten(screen.getByTestId("canvas-element-frame-sticker-1").props.style).zIndex).toBe(50);
  });

  it("uses the legacy direct photo host without a dynamic wrapper or selection overlay", () => {
    const screen = render(<CanvasPage interactive layout={{ ...layout, elements: [layout.elements[0]] }} selectedElementId="photo-1" width={300} />);

    expect(screen.queryByTestId("canvas-element-selection-photo-1")).toBeNull();
    expect(screen.queryByTestId("canvas-element-content-photo-1")).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId("canvas-element-photo-1").props.style)).toMatchObject({
      borderColor: "#B76545",
      borderWidth: 2,
    });
    expect(screen.queryByTestId("begin-canvas-handle-transform")).toBeNull();
  });

  it("commits the sanitized finite base patch when canvas dimensions are zero", () => {
    const onTransformEnd = jest.fn();
    const onTransformStart = jest.fn();
    const screen = render(
      <CanvasPage
        height={0}
        interactive
        layout={{ ...layout, elements: [layout.elements[1]] }}
        onTransformEnd={onTransformEnd}
        onTransformStart={onTransformStart}
        selectedElementId="caption-1"
        width={0}
      />,
    );

    fireEvent.press(screen.getByTestId("begin-canvas-handle-transform"));
    fireEvent.press(screen.getByTestId("commit-canvas-transform"));

    expect(onTransformStart).toHaveBeenCalledTimes(1);
    expect(onTransformEnd).toHaveBeenCalledWith("caption-1", {
      x: 0.1,
      y: 0.65,
      width: 0.8,
      height: 0.1,
      rotation: 0,
    });
    expect(Object.values(onTransformEnd.mock.calls[0][1]).every(Number.isFinite)).toBe(true);
  });
});

describe("CanvasToolbar", () => {
  it("forwards selected text actions to its callbacks", () => {
    const selected = layout.elements[1] as CanvasTextElement;
    const onFont = jest.fn();
    const onSize = jest.fn();
    const onColor = jest.fn();
    const onLayer = jest.fn();
    const onDuplicate = jest.fn();
    const onDelete = jest.fn();
    const onAddText = jest.fn();
    const onAddSticker = jest.fn();
    const onAddFrame = jest.fn();
    const onPickBackground = jest.fn();
    const onUpdateElement = jest.fn();
    const screen = render(<CanvasToolbar
      selectedElement={selected}
      onAddText={onAddText}
      onAddSticker={onAddSticker}
      onAddFrame={onAddFrame}
      onPickBackground={onPickBackground}
      onUpdateElement={onUpdateElement}
      onFont={onFont}
      onSize={onSize}
      onColor={onColor}
      onChangeLayer={onLayer}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
    />);

    fireEvent.press(screen.getByText("\u5b57\u4f53"));
    fireEvent.press(screen.getByText("\u5b57\u53f7"));
    fireEvent.press(screen.getByText("\u989c\u8272"));
    fireEvent.press(screen.getByText("\u524d\u79fb"));
    fireEvent.press(screen.getByText("\u540e\u79fb"));
    fireEvent.press(screen.getByText("\u590d\u5236"));
    fireEvent.press(screen.getByText("\u5220\u9664"));

    expect(onFont).toHaveBeenCalledTimes(1);
    expect(onSize).toHaveBeenCalledTimes(1);
    expect(onColor).toHaveBeenCalledTimes(1);
    expect(onLayer).toHaveBeenNthCalledWith(1, "caption-1", "forward");
    expect(onLayer).toHaveBeenNthCalledWith(2, "caption-1", "backward");
    expect(onDuplicate).toHaveBeenCalledWith("caption-1");
    expect(onDelete).toHaveBeenCalledWith("caption-1");
  });
});
