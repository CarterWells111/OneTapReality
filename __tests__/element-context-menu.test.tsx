import { act, fireEvent, render } from "@testing-library/react-native";
import * as React from "react";
import type { SharedValue } from "react-native-reanimated";

type GestureCallbacks = {
  begin?: (event: { x: number }) => void;
  update?: (event: { x: number }) => void;
  finalize?: (event?: unknown, success?: boolean) => void;
};

const mockGestures: GestureCallbacks[] = [];
const mockRunOnJSCalls: Array<() => void> = [];

jest.mock("react-native-gesture-handler", () => {
  const createPan = () => {
    const callbacks: GestureCallbacks = {};
    mockGestures.push(callbacks);
    const gesture = {
      simultaneousWithExternalGesture: () => gesture,
      onBegin: (callback: GestureCallbacks["begin"]) => {
        callbacks.begin = callback;
        return gesture;
      },
      onChange: () => gesture,
      onUpdate: (callback: GestureCallbacks["update"]) => {
        callbacks.update = callback;
        return gesture;
      },
      onFinalize: (callback: GestureCallbacks["finalize"]) => {
        callbacks.finalize = callback;
        return gesture;
      },
    };
    return gesture;
  };
  return {
    Gesture: { Pan: createPan },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock("react-native-reanimated", () => {
  const Reanimated = require("react-native-reanimated/mock");
  return {
    ...Reanimated,
    runOnJS: (callback: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
      mockRunOnJSCalls.push(() => { callback(...args); });
    },
  };
});

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

function renderMenu(props: Partial<React.ComponentProps<typeof ElementContextMenu>> = {}) {
  return render(
    <ElementContextMenu
      element={textElement}
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
  beforeEach(() => {
    mockGestures.length = 0;
    mockRunOnJSCalls.length = 0;
  });

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

  it("renders as a stable inline panel instead of a canvas-covering modal", () => {
    const screen = renderMenu({ initialMode: "color" });

    expect(screen.getByTestId("text-style-panel")).toBeTruthy();
    expect(screen.queryByTestId("context-menu-backdrop")).toBeNull();
  });

  it("commits font selection without remounting the style panel", () => {
    const onChangeFont = jest.fn();
    const onClose = jest.fn();
    const screen = renderMenu({ initialMode: "font", onChangeFont, onClose });
    fireEvent.press(screen.getByText("喜脉喜欢"));
    expect(onChangeFont).toHaveBeenCalledWith("XiMaiXiHuan");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("text-style-panel")).toBeTruthy();
  });

  it("commits a preset color without remounting the style panel", () => {
    const onChangeColor = jest.fn();
    const onClose = jest.fn();
    const screen = renderMenu({ initialMode: "color", onChangeColor, onClose });

    fireEvent.press(screen.getByText("✓").parent!);

    expect(onChangeColor).toHaveBeenCalledTimes(1);
    expect(onChangeColor).toHaveBeenCalledWith("#1C2C28");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("text-style-panel")).toBeTruthy();
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

  it("reports a complete font-size draft before blur without committing it", () => {
    const onFontSizeDraftChange = jest.fn();
    const onChangeSize = jest.fn();
    const screen = render(
      <ElementContextMenu
        element={textElement}
        initialMode="size"
        onChangeColor={() => undefined}
        onChangeFont={() => undefined}
        onChangeSize={onChangeSize}
        onClose={() => undefined}
        onFontSizeDraftChange={onFontSizeDraftChange}
        visible
      />,
    );

    fireEvent.changeText(screen.getByLabelText("输入字号"), "28");
    expect(onFontSizeDraftChange).toHaveBeenLastCalledWith(28);
    expect(onChangeSize).not.toHaveBeenCalled();
  });

  it("keeps font-size drag previews on the UI thread and queues one final commit", () => {
    const onChangeSize = jest.fn();
    const fontSizePreview = { value: 16 } as SharedValue<number>;
    renderMenu({ initialMode: "size", fontSizePreview, onChangeSize });

    const sliderGesture = mockGestures[0];
    act(() => {
      sliderGesture.begin?.({ x: 0 });
      sliderGesture.update?.({ x: 150 });
      sliderGesture.update?.({ x: 300 });
    });

    expect(fontSizePreview.value).toBe(40);
    expect(mockRunOnJSCalls).toHaveLength(0);
    expect(onChangeSize).not.toHaveBeenCalled();

    act(() => sliderGesture.finalize?.());
    expect(mockRunOnJSCalls).toHaveLength(1);
    expect(onChangeSize).not.toHaveBeenCalled();
    act(() => mockRunOnJSCalls[0]?.());
    expect(onChangeSize).toHaveBeenCalledTimes(1);
    expect(onChangeSize).toHaveBeenCalledWith(40);
  });

  it("restores the UI-thread start size when a continuous gesture is cancelled", () => {
    const onChangeSize = jest.fn();
    const onCancelSize = jest.fn();
    const fontSizePreview = { value: 16 } as SharedValue<number>;
    renderMenu({ initialMode: "size", fontSizePreview, onCancelSize, onChangeSize });

    const sliderGesture = mockGestures[0];
    act(() => sliderGesture.begin?.({ x: 300 }));
    expect(fontSizePreview.value).toBe(40);
    act(() => sliderGesture.finalize?.(undefined, false));
    expect(fontSizePreview.value).toBe(16);
    act(() => mockRunOnJSCalls[0]?.());
    expect(onCancelSize).toHaveBeenCalledTimes(1);
    expect(onChangeSize).not.toHaveBeenCalled();

    act(() => {
      sliderGesture.begin?.({ x: 300 });
      sliderGesture.finalize?.(undefined, true);
    });
    act(() => mockRunOnJSCalls[1]?.());
    expect(onChangeSize).toHaveBeenCalledWith(40);
  });

  it("deduplicates a font-size submit followed by blur and permits a later edit", () => {
    const onChangeSize = jest.fn();
    const screen = renderMenu({ initialMode: "size", onChangeSize });
    const input = screen.getByLabelText("输入字号");

    fireEvent.changeText(input, "20");
    fireEvent(input, "submitEditing");
    fireEvent(input, "blur");
    expect(onChangeSize).toHaveBeenCalledTimes(1);

    fireEvent.changeText(input, "24");
    fireEvent(input, "submitEditing");
    fireEvent(input, "blur");
    expect(onChangeSize).toHaveBeenCalledTimes(2);
    expect(onChangeSize).toHaveBeenLastCalledWith(24);
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

  it("closes via the inline panel close button", () => {
    const onClose = jest.fn();
    const screen = renderMenu({ initialMode: "font", onClose });
    fireEvent.press(screen.getByLabelText("收起样式面板"));
    expect(onClose).toHaveBeenCalled();
  });
});
