import { act, render } from "@testing-library/react-native";
import * as React from "react";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";

import { CanvasPage } from "../src/features/canvas/canvas-page";
import { createTransformSettleGate } from "../src/features/canvas/editor-save-transaction";
import type { CanvasLayout } from "../src/types/memory";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockRunOnJSQueue: Array<() => void> = [];

jest.mock("react-native-reanimated", () => {
  const actual = jest.requireActual("react-native-reanimated/mock");
  return {
    ...actual,
    runOnJS: (callback: (...args: any[]) => void) => (...args: any[]) => {
      mockRunOnJSQueue.push(() => callback(...args));
    },
  };
});

const layout: CanvasLayout = {
  aspectRatio: 3 / 4,
  elements: [{
    id: "photo-1",
    type: "image",
    uri: "file://lake.jpg",
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.2,
    rotation: 0,
    zIndex: 1,
  }],
};

const textLayout: CanvasLayout = {
  aspectRatio: 3 / 4,
  elements: [{
    id: "text-1",
    type: "text",
    text: "Corner resize",
    fontStyle: "system",
    color: "#222222",
    fontSize: 16,
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.2,
    rotation: 0,
    zIndex: 1,
  }],
};

function flushRunOnJSQueue() {
  act(() => {
    while (mockRunOnJSQueue.length > 0) {
      mockRunOnJSQueue.shift()?.();
    }
  });
}

function performTextGesture(kind: "handle" | "pan" | "pinch" | "rotation") {
  const testId = kind === "handle"
    ? "canvas-selection-handle-bottom-right"
    : `canvas-element-${kind}-text-1`;
  const events = kind === "handle"
    ? [
        { state: State.BEGAN, translationX: 0, translationY: 0 },
        { state: State.ACTIVE, translationX: 0, translationY: 0 },
        { translationX: 30, translationY: 0 },
        { state: State.END, translationX: 30, translationY: 0 },
      ]
    : kind === "pinch"
      ? [
          { state: State.BEGAN, scale: 1 },
          { state: State.ACTIVE, scale: 1 },
          { scale: 1.2 },
          { state: State.END, scale: 1.2 },
        ]
      : kind === "rotation"
        ? [
            { state: State.BEGAN, rotation: 0 },
            { state: State.ACTIVE, rotation: 0 },
            { rotation: 0.2 },
            { state: State.END, rotation: 0.2 },
          ]
        : [
          { state: State.BEGAN, translationX: 0, translationY: 0 },
          { state: State.ACTIVE, translationX: 0, translationY: 0 },
          { state: State.END, translationX: 0, translationY: 0 },
        ];
  fireGestureHandler(getByGestureTestId(testId), events);
}

describe("overlapping canvas transforms", () => {
  beforeEach(() => mockRunOnJSQueue.splice(0));

  it("releases transform ownership when an element unmounts before native finalize reaches JS", () => {
    const gate = createTransformSettleGate();
    const replacementGate = createTransformSettleGate();
    const strictModeWarning = jest.spyOn(console, "error").mockImplementation((...args) => {
      const renderedMessage = args.map(String).join(" ");
      if (!renderedMessage.includes("findNodeHandle") || !renderedMessage.includes("deprecated in StrictMode")) {
        throw new Error(`Unexpected StrictMode console error: ${renderedMessage}`);
      }
    });
    let screen: ReturnType<typeof render>;
    try {
      screen = render(
        <React.StrictMode>
          <CanvasPage
            interactive
            layout={layout}
            onTransformSettled={() => gate.end()}
            onTransformStart={() => gate.begin()}
            selectedElementId="photo-1"
            width={300}
          />
        </React.StrictMode>,
      );
    } finally {
      strictModeWarning.mockRestore();
    }

    act(() => {
      fireGestureHandler(getByGestureTestId("canvas-element-pinch-photo-1"), [
        { state: State.BEGAN, scale: 1 },
        { state: State.ACTIVE, scale: 1.2 },
        { state: State.END, scale: 1.2 },
      ]);
      mockRunOnJSQueue.shift()?.();
      mockRunOnJSQueue.shift()?.();
    });
    expect(gate.isPending()).toBe(true);

    // Hold the native final commit until after the selected element leaves the
    // rendered page, modeling a delayed finalize callback.
    const delayedFinalize = mockRunOnJSQueue.pop();
    mockRunOnJSQueue.splice(0);
    screen.rerender(
      <React.StrictMode>
        <CanvasPage
          interactive
          layout={layout}
          onTransformSettled={() => replacementGate.end()}
          onTransformStart={() => replacementGate.begin()}
          selectedElementId="photo-1"
          width={300}
        />
      </React.StrictMode>,
    );
    screen.rerender(
      <React.StrictMode>
        <CanvasPage
          interactive
          layout={{ ...layout, elements: [] }}
          onTransformSettled={() => replacementGate.end()}
          onTransformStart={() => replacementGate.begin()}
          width={300}
        />
      </React.StrictMode>,
    );

    expect(gate.isPending()).toBe(false);
    expect(replacementGate.isPending()).toBe(false);

    act(() => delayedFinalize?.());
    expect(gate.isPending()).toBe(false);
    expect(replacementGate.isPending()).toBe(false);
  });

  it("composes a second pinch before the delayed first commit reaches JS", () => {
    const onTransformEnd = jest.fn();
    const onTransformSettled = jest.fn();
    const onTransformStart = jest.fn();
    render(
      <CanvasPage
        interactive
        layout={layout}
        onTransformEnd={onTransformEnd}
        onTransformSettled={onTransformSettled}
        onTransformStart={onTransformStart}
        selectedElementId="photo-1"
        width={300}
      />,
    );

    act(() => {
      fireGestureHandler(getByGestureTestId("canvas-element-pinch-photo-1"), [
        { state: State.BEGAN, scale: 1 },
        { state: State.ACTIVE, scale: 1 },
        { scale: 1.5 },
        { state: State.END, scale: 1.5 },
      ]);
      fireGestureHandler(getByGestureTestId("canvas-element-pinch-photo-1"), [
        { state: State.BEGAN, scale: 1 },
        { state: State.ACTIVE, scale: 1 },
        { scale: 1.2 },
        { state: State.END, scale: 1.2 },
      ]);
    });

    expect(onTransformEnd).not.toHaveBeenCalled();
    flushRunOnJSQueue();

    expect(onTransformStart).toHaveBeenCalledTimes(2);
    expect(onTransformSettled).toHaveBeenCalledTimes(2);
    expect(onTransformEnd).toHaveBeenCalledTimes(1);
    expect(onTransformEnd.mock.calls[0][1].width).toBeCloseTo(0.36);
    expect(onTransformEnd.mock.calls[0][1].height).toBeCloseTo(0.36);
  });

  it("lets a handle own its update before a delayed outer pan commit", () => {
    const onTransformEnd = jest.fn();
    render(<CanvasPage interactive layout={textLayout} onTransformEnd={onTransformEnd} selectedElementId="text-1" width={300} />);

    act(() => {
      fireGestureHandler(getByGestureTestId("canvas-element-pan-text-1"), [
        { state: State.BEGAN, translationX: 0, translationY: 0 },
        { state: State.ACTIVE, translationX: 0, translationY: 0 },
        { translationX: 30, translationY: 0 },
        { state: State.END, translationX: 30, translationY: 0 },
      ]);
      fireGestureHandler(getByGestureTestId("canvas-selection-handle-bottom-right"), [
        { state: State.BEGAN, translationX: 0, translationY: 0 },
        { state: State.ACTIVE, translationX: 0, translationY: 0 },
        { translationX: 30, translationY: 0 },
        { state: State.END, translationX: 30, translationY: 0 },
      ]);
    });

    expect(onTransformEnd).not.toHaveBeenCalled();
    flushRunOnJSQueue();

    expect(onTransformEnd).toHaveBeenCalledTimes(1);
    expect(onTransformEnd.mock.calls[0][1]).toMatchObject({ x: 0.2, width: 0.3 });
  });

  it("preserves corner-resize font semantics when a newer pan beats the delayed handle commit", () => {
    const onTransformEnd = jest.fn();
    render(<CanvasPage interactive layout={textLayout} onTransformEnd={onTransformEnd} selectedElementId="text-1" width={300} />);

    act(() => {
      fireGestureHandler(getByGestureTestId("canvas-selection-handle-bottom-right"), [
        { state: State.BEGAN, translationX: 0, translationY: 0 },
        { state: State.ACTIVE, translationX: 0, translationY: 0 },
        { translationX: 30, translationY: 0 },
        { state: State.END, translationX: 30, translationY: 0 },
      ]);
      fireGestureHandler(getByGestureTestId("canvas-element-pan-text-1"), [
        { state: State.BEGAN, translationX: 0, translationY: 0 },
        { state: State.ACTIVE, translationX: 0, translationY: 0 },
        { state: State.END, translationX: 0, translationY: 0 },
      ]);
    });

    flushRunOnJSQueue();

    expect(onTransformEnd).toHaveBeenCalledTimes(1);
    expect(onTransformEnd.mock.calls[0][1]).toMatchObject({ width: 0.3 });
    expect(onTransformEnd.mock.calls[0][1]).not.toHaveProperty("fontSize");
  });

  it("scales text from the resized box baseline when a real pinch follows a delayed handle commit", () => {
    const onTransformEnd = jest.fn();
    render(<CanvasPage interactive layout={textLayout} onTransformEnd={onTransformEnd} selectedElementId="text-1" width={300} />);

    act(() => {
      fireGestureHandler(getByGestureTestId("canvas-selection-handle-bottom-right"), [
        { state: State.BEGAN, translationX: 0, translationY: 0 },
        { state: State.ACTIVE, translationX: 0, translationY: 0 },
        { translationX: 30, translationY: 0 },
        { state: State.END, translationX: 30, translationY: 0 },
      ]);
      fireGestureHandler(getByGestureTestId("canvas-element-pinch-text-1"), [
        { state: State.BEGAN, scale: 1 },
        { state: State.ACTIVE, scale: 1 },
        { scale: 1.2 },
        { state: State.END, scale: 1.2 },
      ]);
    });

    flushRunOnJSQueue();

    expect(onTransformEnd).toHaveBeenCalledTimes(1);
    expect(onTransformEnd.mock.calls[0][1].width).toBeCloseTo(0.36);
    expect(onTransformEnd.mock.calls[0][1].fontSize).toBe(19);
  });

  it.each([
    { name: "pinch then handle", gestures: ["pinch", "handle"] as const, width: 0.36, fontSize: 19 },
    { name: "handle then pinch", gestures: ["handle", "pinch"] as const, width: 0.36, fontSize: 19 },
    { name: "handle then pan", gestures: ["handle", "pan"] as const, width: 0.3, fontSize: undefined },
    { name: "pinch then pan", gestures: ["pinch", "pan"] as const, width: 0.24, fontSize: 19 },
    { name: "pinch then rotation", gestures: ["pinch", "rotation"] as const, width: 0.24, fontSize: 19 },
    { name: "two pinches", gestures: ["pinch", "pinch"] as const, width: 0.288, fontSize: 23 },
  ])("commits independent text geometry and font provenance for $name", ({ gestures, width, fontSize }) => {
    const onTransformEnd = jest.fn();
    render(<CanvasPage interactive layout={textLayout} onTransformEnd={onTransformEnd} selectedElementId="text-1" width={300} />);

    act(() => gestures.forEach(performTextGesture));
    expect(onTransformEnd).not.toHaveBeenCalled();

    flushRunOnJSQueue();

    expect(onTransformEnd).toHaveBeenCalledTimes(1);
    expect(onTransformEnd.mock.calls[0][1].width).toBeCloseTo(width);
    if (fontSize === undefined) {
      expect(onTransformEnd.mock.calls[0][1]).not.toHaveProperty("fontSize");
    } else {
      expect(onTransformEnd.mock.calls[0][1].fontSize).toBe(fontSize);
    }
  });
});
