import { act, fireEvent, render } from "@testing-library/react-native";

const mockGestureHandlers: Record<string, { begin?: () => void; update?: (event: { scale?: number; translationX?: number; translationY?: number }) => void }> = {};

jest.mock("react-native-gesture-handler", () => {
  const { View } = require("react-native");
  const createGesture = () => {
    const gesture: Record<string, unknown> = {};
    gesture.enabled = () => gesture;
    gesture.onBegin = (callback: () => void) => { gesture.begin = callback; return gesture; };
    gesture.onUpdate = (callback: (event: { scale?: number; translationX?: number; translationY?: number }) => void) => { gesture.update = callback; return gesture; };
    return gesture;
  };
  return {
    Gesture: {
      Pan: () => { const gesture = createGesture(); mockGestureHandlers.pan = gesture; return gesture; },
      Pinch: () => { const gesture = createGesture(); mockGestureHandlers.pinch = gesture; return gesture; },
      Simultaneous: (...gestures: unknown[]) => ({ gestures }),
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

import { CityMap, type CityStats } from "../src/features/cities";

const stats: CityStats[] = [
  { city: "hangzhou", intensity: "none", isVisited: false, unlocked: false, visitCount: 0 },
  { city: "shanghai", intensity: "none", isVisited: false, unlocked: false, visitCount: 0 },
  { city: "shenzhen", intensity: "none", isVisited: false, unlocked: false, visitCount: 0 },
];

describe("CityMap workspace gestures", () => {
  it("executes pan and pinch updates against the measured viewport bounds", async () => {
    const screen = await render(<CityMap initialCity="shenzhen" stats={stats} variant="workspace" />);
    await act(async () => {
      fireEvent(screen.getByTestId("city-map-workspace"), "layout", {
        nativeEvent: { layout: { height: 320, width: 480, x: 0, y: 0 } },
      });
    });

    await act(async () => {
      mockGestureHandlers.pan.begin?.();
      mockGestureHandlers.pan.update?.({ translationX: 1000, translationY: -1000 });
    });
    expect(screen.getByTestId("city-map-workspace-canvas").props.style.transform).toEqual([
      { translateX: 240 },
      { translateY: -160 },
      { scale: 2 },
    ]);

    await act(async () => {
      mockGestureHandlers.pinch.begin?.();
      mockGestureHandlers.pinch.update?.({ scale: 4 });
    });
    expect(screen.getByTestId("city-map-workspace-canvas").props.style.transform).toEqual([
      { translateX: 240 },
      { translateY: -160 },
      { scale: 3.5 },
    ]);
  });
});
