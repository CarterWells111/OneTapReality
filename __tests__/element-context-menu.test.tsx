import { fireEvent, render } from "@testing-library/react-native";
import * as React from "react";

import { ElementContextMenu } from "../src/features/canvas/element-context-menu";
import type { CanvasTextElement } from "../src/types/memory";

const textElement: CanvasTextElement = {
  id: "text-1",
  type: "text",
  text: "你好",
  fontStyle: "ZhaohuaTypeWriter",
  color: "#1C2C28",
  fontSize: 16,
  x: 0.1,
  y: 0.1,
  width: 0.8,
  height: 0.2,
  rotation: 0,
  zIndex: 1,
};

const frame = { x: 100, y: 200, width: 200, height: 60 };

function renderMenu(props: Partial<React.ComponentProps<typeof ElementContextMenu>> = {}) {
  return render(
    <ElementContextMenu
      element={textElement}
      elementFrame={frame}
      onChangeColor={jest.fn()}
      onChangeFont={jest.fn()}
      onChangeSize={jest.fn()}
      onClose={jest.fn()}
      visible={true}
      {...props}
    />
  );
}

describe("ElementContextMenu", () => {
  it("renders font panel with all font options and no back button", () => {
    const screen = renderMenu({ initialMode: "font" });
    expect(screen.getByText("选择字体")).toBeTruthy();
    expect(screen.getByText("朝华打字机")).toBeTruthy();
    expect(screen.queryByText("返回")).toBeNull();
    expect(screen.queryByText("← 返回")).toBeNull();
  });

  it("renders size panel with slider and numeric input, no back button", () => {
    const screen = renderMenu({ initialMode: "size" });
    expect(screen.getByText("选择字号")).toBeTruthy();
    expect(screen.getByLabelText("字号进度条")).toBeTruthy();
    expect(screen.getByLabelText("输入字号")).toBeTruthy();
    expect(screen.queryByText("返回")).toBeNull();
  });

  it("renders color panel with presets and custom picker, no back button", () => {
    const screen = renderMenu({ initialMode: "color" });
    expect(screen.getByText("选择颜色")).toBeTruthy();
    expect(screen.getByText("推荐配色")).toBeTruthy();
    expect(screen.getByLabelText("十六进制颜色值")).toBeTruthy();
    expect(screen.queryByText("返回")).toBeNull();
  });

  it("commits font selection and closes", () => {
    const onChangeFont = jest.fn();
    const onClose = jest.fn();
    const screen = renderMenu({ initialMode: "font", onChangeFont, onClose });
    fireEvent.press(screen.getByText("喜脉喜欢"));
    expect(onChangeFont).toHaveBeenCalledWith("XiMaiXiHuan");
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the menu open while typing into the size input (no auto-close)", () => {
    const onChangeSize = jest.fn();
    const onClose = jest.fn();
    const screen = renderMenu({ initialMode: "size", onChangeSize, onClose });
    const input = screen.getByLabelText("输入字号");

    fireEvent.changeText(input, "3");
    fireEvent(input, "blur");
    expect(onChangeSize).toHaveBeenCalledWith(3);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores invalid numeric input and reverts to the current value on blur", () => {
    const onChangeSize = jest.fn();
    const screen = renderMenu({ initialMode: "size", onChangeSize });
    const input = screen.getByLabelText("输入字号");

    fireEvent.changeText(input, "1"); // 低于最小值 2
    fireEvent(input, "blur");
    expect(onChangeSize).toHaveBeenCalledWith(2);
    expect(screen.getByLabelText("输入字号").props.value).toBe("2");
  });

  it("closes via the dimmed backdrop press", () => {
    const onClose = jest.fn();
    const screen = renderMenu({ initialMode: "font", onClose });
    fireEvent.press(screen.getByTestId("context-menu-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
});
