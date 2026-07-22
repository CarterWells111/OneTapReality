import { fireEvent, render } from "@testing-library/react-native";

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
  it("renders image, text and sticker elements then selects the pressed element", async () => {
    const onSelect = jest.fn();
    const screen = await render(
      <CanvasPage layout={layout} selectedElementId="caption-1" onSelectElement={onSelect} />,
    );

    expect(screen.getByTestId("canvas-image-photo-1")).toBeTruthy();
    expect(screen.getByText("西湖边的下午")).toBeTruthy();
    expect(screen.getByText("❤️")).toBeTruthy();
    expect(screen.getByTestId("canvas-element-caption-1").props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ borderWidth: 2 })]),
    );

    await fireEvent.press(screen.getByTestId("canvas-element-sticker-1"));

    expect(onSelect).toHaveBeenCalledWith("sticker-1");
  });

  it("does not select elements when used as a read-only saved-page preview", async () => {
    const onSelect = jest.fn();
    const screen = await render(<CanvasPage interactive={false} layout={layout} onSelectElement={onSelect} />);

    await fireEvent.press(screen.getByTestId("canvas-element-sticker-1"));

    expect(onSelect).not.toHaveBeenCalled();
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
    const screen = await render(
      <CanvasToolbar
        selectedElement={selected}
        onAddText={onAddText}
        onAddSticker={onAddSticker}
        onUpdateElement={onStyle}
        onChangeLayer={onLayer}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
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

    expect(onAddText).toHaveBeenCalledTimes(1);
    expect(onAddSticker).toHaveBeenCalledTimes(1);
    expect(onStyle).toHaveBeenCalledWith("caption-1", { fontStyle: "avenir" });
    expect(onStyle).toHaveBeenCalledWith("caption-1", { color: "#1C5A4C" });
    expect(onLayer).toHaveBeenNthCalledWith(1, "caption-1", "forward");
    expect(onLayer).toHaveBeenNthCalledWith(2, "caption-1", "backward");
    expect(onDuplicate).toHaveBeenCalledWith("caption-1");
    expect(onDelete).toHaveBeenCalledWith("caption-1");
  });
});
