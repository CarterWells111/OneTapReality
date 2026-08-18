import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";

import { CanvasElement } from "../src/features/canvas/canvas-element";
import type { CanvasImageElement } from "../src/types/memory";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockImageMounts = new Map<string, number>();
const mockImageUnmounts = new Map<string, number>();

jest.mock("expo-image", () => {
  const React = require("react") as typeof import("react");
  const { View } = require("react-native") as typeof import("react-native");

  return {
    Image: ({ testID, source }: { testID?: string; source?: unknown }) => {
      React.useEffect(() => {
        if (!testID?.startsWith("canvas-image-")) return undefined;
        mockImageMounts.set(testID, (mockImageMounts.get(testID) ?? 0) + 1);
        return () => {
          mockImageUnmounts.set(testID, (mockImageUnmounts.get(testID) ?? 0) + 1);
        };
      }, [testID]);
      // The native Image mock only needs a host node for lifecycle assertions.
      // `View` deliberately has no `source` prop.
      void source;
      return <View testID={testID} />;
    },
  };
});

const imageElement: CanvasImageElement = {
  height: 0.5,
  id: "photo-1",
  rotation: 0,
  type: "image",
  uri: "file://lake.jpg",
  width: 0.8,
  x: 0.1,
  y: 0.1,
  zIndex: 1,
};

function renderElement(interactive: boolean, callbacks: {
  onInteract?: (id: string) => void;
  onSelect?: (id: string) => void;
  onTransformStart?: () => void;
} = {}, selectionContext = interactive ? imageElement.id : undefined) {
  return (
    <CanvasElement
      canvasHeight={400}
      canvasWidth={300}
      element={imageElement}
      interactive={interactive}
      isSelected={interactive}
      onInteract={callbacks.onInteract}
      onSelect={callbacks.onSelect ?? (() => undefined)}
      onTransformStart={callbacks.onTransformStart}
      selectionContext={selectionContext}
    />
  );
}

describe("CanvasElement host lifecycle", () => {
  beforeEach(() => {
    mockImageMounts.clear();
    mockImageUnmounts.clear();
  });

  it("keeps the same frame and image mounted while interactive mode changes", () => {
    const screen = render(renderElement(false));
    const initialFrame = screen.getByTestId("canvas-element-frame-photo-1");
    const initialPressTarget = screen.getByTestId("canvas-element-photo-1");
    const initialImage = screen.getByTestId("canvas-image-photo-1");

    screen.rerender(renderElement(true));
    expect(screen.getByTestId("canvas-element-frame-photo-1")).toBe(initialFrame);
    expect(screen.getByTestId("canvas-element-photo-1")).toBe(initialPressTarget);
    expect(screen.getByTestId("canvas-image-photo-1")).toBe(initialImage);

    screen.rerender(renderElement(false));
    expect(screen.getByTestId("canvas-element-frame-photo-1")).toBe(initialFrame);
    expect(screen.getByTestId("canvas-element-photo-1")).toBe(initialPressTarget);
    expect(screen.getByTestId("canvas-image-photo-1")).toBe(initialImage);
    expect(mockImageMounts.get("canvas-image-photo-1")).toBe(1);
    expect(mockImageUnmounts.get("canvas-image-photo-1") ?? 0).toBe(0);
  });

  it("withholds press, gesture, and accessibility behavior while read-only", () => {
    const onInteract = jest.fn();
    const onSelect = jest.fn();
    const onTransformStart = jest.fn();
    const screen = render(renderElement(false, { onInteract, onSelect, onTransformStart }));
    const host = screen.getByTestId("canvas-element-photo-1");

    expect(host.props.accessible).toBe(false);
    expect(host.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(host.props.importantForAccessibility).toBe("no");
    expect(host.props.pointerEvents).toBe("none");
    expect(host.props.accessibilityRole).toBeUndefined();
    expect(host.props.accessibilityHint).toBeUndefined();
    expect(host.props.onPress).toBeUndefined();

    fireEvent.press(host);
    fireGestureHandler(getByGestureTestId("canvas-element-pan-photo-1"), [
      { state: State.BEGAN, translationX: 0, translationY: 0 },
      { state: State.ACTIVE, translationX: 20, translationY: 10 },
      { state: State.END, translationX: 20, translationY: 10 },
    ]);

    expect(onInteract).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onTransformStart).not.toHaveBeenCalled();
  });

  it("clears a pending first press when interaction mode changes", () => {
    const onSelect = jest.fn();
    const selectionContext = imageElement.id;
    const screen = render(renderElement(true, { onSelect }, selectionContext));

    fireEvent.press(screen.getByTestId("canvas-element-photo-1"));
    expect(onSelect).not.toHaveBeenCalled();

    screen.rerender(renderElement(false, { onSelect }, selectionContext));
    screen.rerender(renderElement(true, { onSelect }, selectionContext));
    fireEvent.press(screen.getByTestId("canvas-element-photo-1"));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders a labeled local placeholder instead of loading a missing photo token", () => {
    const missing = { ...imageElement, uri: "missing-local-photo://gone" };
    const screen = render(
      <CanvasElement canvasHeight={400} canvasWidth={300} element={missing} interactive={false} isSelected={false} onSelect={() => undefined} selectionContext={undefined} />,
    );

    expect(screen.getByTestId("canvas-missing-image-placeholder")).toBeTruthy();
    expect(screen.getByLabelText("本地照片缺失").props.accessibilityRole).toBe("image");
    expect(screen.queryByTestId("canvas-image-photo-1")).toBeNull();
  });
});
