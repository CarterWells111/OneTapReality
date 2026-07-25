import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { CanvasPage } from "../src/features/canvas/canvas-page";
import { CanvasToolbar } from "../src/features/canvas/canvas-toolbar";
import type { CanvasLayout, CanvasTextElement } from "../src/types/memory";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

  it("keeps saved geometry in a read-only 3:4 preview", () => {
    const transformed: CanvasLayout = { ...layout, elements: [{ ...layout.elements[0], x: 0.2, y: 0.25, width: 0.5, height: 0.3, rotation: 0.42 }] };
    const screen = render(<CanvasPage displayAspectRatio={3 / 4} interactive={false} layout={transformed} width={300} />);

    expect(StyleSheet.flatten(screen.getByTestId("album-canvas").props.style)).toMatchObject({ height: 400, width: 300 });
    expect(StyleSheet.flatten(screen.getByTestId("canvas-element-photo-1").props.style)).toMatchObject({
      height: 120, left: 60, top: 100, width: 150, transform: [{ rotate: "0.42rad" }],
    });
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
