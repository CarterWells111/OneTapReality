import { act, fireEvent, render } from "@testing-library/react-native";
import * as React from "react";
import type { SharedValue } from "react-native-reanimated";

type GestureCallbacks = {
  begin?: (event: { x: number; y: number }) => void;
  change?: (event: { x: number; y: number }) => void;
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
      onChange: (callback: GestureCallbacks["change"]) => {
        callbacks.change = callback;
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

import { ColorPicker } from "../src/components/ColorPicker";

describe("ColorPicker", () => {
  beforeEach(() => {
    mockGestures.length = 0;
    mockRunOnJSCalls.length = 0;
  });

  it("keeps continuous previews on the UI thread and queues only the final color commit", () => {
    const onCommit = jest.fn();
    const previewValue = { value: "#FF0000" } as SharedValue<string>;
    render(<ColorPicker value="#FF0000" previewValue={previewValue} onCommit={onCommit} />);

    const saturationGesture = mockGestures[0];
    act(() => {
      saturationGesture.begin?.({ x: 0, y: 0 });
      saturationGesture.change?.({ x: 100, y: 100 });
      saturationGesture.change?.({ x: 200, y: 200 });
    });

    expect(previewValue.value).toBe("#000000");
    expect(mockRunOnJSCalls).toHaveLength(0);
    expect(onCommit).not.toHaveBeenCalled();

    act(() => saturationGesture.finalize?.());
    expect(mockRunOnJSCalls).toHaveLength(1);
    expect(onCommit).not.toHaveBeenCalled();

    act(() => mockRunOnJSCalls[0]?.());
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("#000000");
  });

  it("restores the UI-thread start color when a continuous gesture is cancelled", () => {
    const onCommit = jest.fn();
    const onCancel = jest.fn();
    const previewValue = { value: "#FF0000" } as SharedValue<string>;
    render(
      <ColorPicker value="#FF0000" previewValue={previewValue} onCancel={onCancel} onCommit={onCommit} />,
    );

    const saturationGesture = mockGestures[0];
    act(() => saturationGesture.begin?.({ x: 0, y: 200 }));
    expect(previewValue.value).toBe("#000000");
    act(() => saturationGesture.finalize?.(undefined, false));
    expect(previewValue.value).toBe("#FF0000");
    act(() => mockRunOnJSCalls[0]?.());
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();

    act(() => {
      saturationGesture.begin?.({ x: 0, y: 200 });
      saturationGesture.finalize?.(undefined, true);
    });
    act(() => mockRunOnJSCalls[1]?.());
    expect(onCommit).toHaveBeenCalledWith("#000000");
  });

  it("keeps an incomplete hex draft local and commits only a complete hex value", () => {
    const onCommit = jest.fn();
    const screen = render(
      <ColorPicker value="#1C2C28" onCommit={onCommit} />,
    );
    const input = screen.getByLabelText("十六进制颜色值");

    fireEvent.changeText(input, "#12");
    expect(input.props.value).toBe("#12");
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent(input, "blur");
    expect(screen.getByLabelText("十六进制颜色值").props.value).toBe("#1C2C28");
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText("十六进制颜色值"), "#123456");
    fireEvent(screen.getByLabelText("十六进制颜色值"), "submitEditing");
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("#123456");
  });

  it("reports only complete typed color drafts before blur", () => {
    const onDraftChange = jest.fn();
    const screen = render(
      <ColorPicker value="#1C2C28" onCommit={() => undefined} onDraftChange={onDraftChange} />,
    );
    const input = screen.getByLabelText("十六进制颜色值");

    fireEvent.changeText(input, "#12");
    expect(onDraftChange).toHaveBeenLastCalledWith(undefined);
    fireEvent.changeText(input, "#123456");
    expect(onDraftChange).toHaveBeenLastCalledWith("#123456");
  });

  it("reports an RGB draft only when every channel is a valid integer", () => {
    const onCommit = jest.fn();
    const onDraftChange = jest.fn();
    const screen = render(
      <ColorPicker value="#1C2C28" onCommit={onCommit} onDraftChange={onDraftChange} />,
    );
    const red = screen.getByLabelText("颜色分量 R");
    const green = screen.getByLabelText("颜色分量 G");
    const blue = screen.getByLabelText("颜色分量 B");

    fireEvent.changeText(red, "");
    fireEvent.changeText(green, "");
    fireEvent.changeText(blue, "");
    fireEvent.changeText(red, "18");
    fireEvent.changeText(green, "52");
    expect(onDraftChange).toHaveBeenLastCalledWith(undefined);
    fireEvent.changeText(blue, "86");
    expect(onDraftChange).toHaveBeenLastCalledWith("#123456");
    fireEvent.changeText(red, "999");
    expect(onDraftChange).toHaveBeenLastCalledWith(undefined);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("deduplicates a hex submit followed by blur and permits a later edit", () => {
    const onCommit = jest.fn();
    const screen = render(<ColorPicker value="#1C2C28" onCommit={onCommit} />);
    const input = screen.getByLabelText("十六进制颜色值");

    fireEvent.changeText(input, "#123456");
    fireEvent(input, "submitEditing");
    fireEvent(input, "blur");
    expect(onCommit).toHaveBeenCalledTimes(1);

    fireEvent.changeText(input, "#654321");
    fireEvent(input, "submitEditing");
    fireEvent(input, "blur");
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenLastCalledWith("#654321");
  });

  it("deduplicates an RGB submit followed by blur and permits a later edit", () => {
    const onCommit = jest.fn();
    const screen = render(<ColorPicker value="#1C2C28" onCommit={onCommit} />);
    const input = screen.getByLabelText("颜色分量 R");

    fireEvent.changeText(input, "100");
    fireEvent(input, "submitEditing");
    fireEvent(input, "blur");
    expect(onCommit).toHaveBeenCalledTimes(1);

    fireEvent.changeText(input, "120");
    fireEvent(input, "submitEditing");
    fireEvent(input, "blur");
    expect(onCommit).toHaveBeenCalledTimes(2);
  });
});
