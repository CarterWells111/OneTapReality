import { act, render } from "@testing-library/react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";

import { CanvasPage } from "../src/features/canvas/canvas-page";
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

  it("composes a second pinch before the delayed first commit reaches JS", () => {
    const onTransformEnd = jest.fn();
    render(<CanvasPage interactive layout={layout} onTransformEnd={onTransformEnd} selectedElementId="photo-1" width={300} />);

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

    expect(onTransformEnd).toHaveBeenCalledTimes(1);
    expect(onTransformEnd.mock.calls[0][1].width).toBeCloseTo(0.36);
    expect(onTransformEnd.mock.calls[0][1].height).toBeCloseTo(0.36);
  });

  it("lets a handle own its update before a delayed outer pan commit", () => {
    const onTransformEnd = jest.fn();
    render(<CanvasPage interactive layout={layout} onTransformEnd={onTransformEnd} selectedElementId="photo-1" width={300} />);

    act(() => {
      fireGestureHandler(getByGestureTestId("canvas-element-pan-photo-1"), [
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
