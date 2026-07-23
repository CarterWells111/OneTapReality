import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { CanvasPage } from "../src/features/canvas/canvas-page";
import { CanvasToolbar } from "../src/features/canvas/canvas-toolbar";
import type { CanvasLayout, CanvasTextElement } from "../src/types/memory";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const layout: CanvasLayout = {
  aspectRatio: 1,
  elements: [
    {
      id: "photo-1",
      type: "image",
      uri: "file://hangzhou.jpg",
      x: 0.08,
      y: 0.08,
      width: 0.84,
      height: 0.5,
      rotation: 0,
      zIndex: 1,
    },
    {
      id: "caption-1",
      type: "text",
      text: "西湖边的下午",
      fontStyle: "system",
      color: "#1C2C28",
      x: 0.1,
      y: 0.65,
      width: 0.8,
      height: 0.1,
      rotation: 0,
      zIndex: 2,
    },
    {
      id: "sticker-1",
      type: "sticker",
      stickerId: "heart",
      x: 0.72,
      y: 0.78,
      width: 0.12,
      height: 0.12,
      rotation: 0,
      zIndex: 3,
    },
  ],
};

describe("CanvasPage", () => {
  it("renders image, text and sticker elements and only selects after a double press", () => {
    const onSelect = jest.fn();
    const screen = render(
      <CanvasPage layout={layout} selectedElementId="caption-1" onSelectElement={onSelect} />,
    );

    expect(screen.getByTestId("canvas-image-photo-1")).toBeTruthy();
    expect(screen.getByText("西湖边的下午")).toBeTruthy();
    expect(screen.getByText("❤️")).toBeTruthy();
    expect(screen.getByTestId("canvas-element-caption-1").props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ borderWidth: 2 })]),
    );

    fireEvent.press(screen.getByTestId("canvas-element-sticker-1"));
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("canvas-element-sticker-1"));
    expect(onSelect).toHaveBeenCalledWith("sticker-1");
  });

  it("does not select elements when used as a read-only saved-page preview", async () => {
    const onSelect = jest.fn();
    const screen = await render(<CanvasPage interactive={false} layout={layout} onSelectElement={onSelect} />);

    await fireEvent.press(screen.getByTestId("canvas-element-sticker-1"));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("disables the blank-press surface when read-only or missing a callback", () => {
    const screen = render(
      <CanvasPage interactive={false} layout={layout} onPressBlank={jest.fn()} />,
    );

    expect(screen.getByTestId("album-canvas")).toHaveProp("accessible", false);
    expect(screen.getByTestId("album-canvas")).toBeDisabled();

    screen.rerender(<CanvasPage layout={layout} />);

    expect(screen.getByTestId("album-canvas")).toHaveProp("accessible", false);
    expect(screen.getByTestId("album-canvas")).toBeDisabled();
  });

  it("preserves saved size, position, and rotation in a read-only 3:4 page", () => {
    const transformedLayout: CanvasLayout = {
      ...layout,
      elements: [{
        ...layout.elements[0],
        x: 0.2,
        y: 0.25,
        width: 0.5,
        height: 0.3,
        rotation: 0.42,
      }],
    };
    const screen = render(
      <CanvasPage
        displayAspectRatio={3 / 4}
        interactive={false}
        layout={transformedLayout}
        width={300}
      />,
    );

    expect(StyleSheet.flatten(screen.getByTestId("album-canvas").props.style)).toMatchObject({
      height: 400,
      width: 300,
    });
    expect(StyleSheet.flatten(screen.getByTestId("canvas-element-photo-1").props.style)).toMatchObject({
      height: 120,
      left: 60,
      top: 100,
      width: 150,
      transform: [{ rotate: "0.42rad" }],
    });
  });

  it("renders a saved sticker glyph at the size of its transformed frame", () => {
    const transformedLayout: CanvasLayout = {
      ...layout,
      elements: [{
        ...layout.elements[2],
        height: 0.28,
        width: 0.28,
      }],
    };
    const screen = render(
      <CanvasPage
        displayAspectRatio={3 / 4}
        height={400}
        interactive={false}
        layout={transformedLayout}
        width={300}
      />,
    );

    expect(StyleSheet.flatten(screen.getByText("❤️").props.style)).toMatchObject({
      fontSize: 68,
      lineHeight: 80,
    });
  });
});

describe("CanvasToolbar", () => {
  const selected: CanvasTextElement = layout.elements[1] as CanvasTextElement;

  it("emits practical element actions through callbacks", async () => {
    const onAddText = jest.fn();
    const onAddSticker = jest.fn();
    const onStyle = jest.fn();
    const onLayer = jest.fn();
    const onDuplicate = jest.fn();
    const onDelete = jest.fn();
    const onDone = jest.fn();
    const screen = await render(
      <CanvasToolbar
        selectedElement={selected}
        onAddText={onAddText}
        onAddSticker={onAddSticker}
        onUpdateElement={onStyle}
        onChangeLayer={onLayer}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onDone={onDone}
      />,
    );

    await fireEvent.press(screen.getByText("添加文字"));
    await fireEvent.press(screen.getByText("添加贴纸"));
    await fireEvent.press(screen.getByText("现代"));
    await fireEvent.press(screen.getByText("深绿"));
    await fireEvent.press(screen.getByText("前移"));
    await fireEvent.press(screen.getByText("后移"));
    await fireEvent.press(screen.getByText("复制"));
    await fireEvent.press(screen.getByText("删除"));
    await fireEvent.press(screen.getByText("完成"));

    expect(onAddText).toHaveBeenCalledTimes(1);
    expect(onAddSticker).toHaveBeenCalledTimes(1);
    expect(onStyle).toHaveBeenCalledWith("caption-1", { fontStyle: "avenir" });
    expect(onStyle).toHaveBeenCalledWith("caption-1", { color: "#1C5A4C" });
    expect(onLayer).toHaveBeenNthCalledWith(1, "caption-1", "forward");
    expect(onLayer).toHaveBeenNthCalledWith(2, "caption-1", "backward");
    expect(onDuplicate).toHaveBeenCalledWith("caption-1");
    expect(onDelete).toHaveBeenCalledWith("caption-1");
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
