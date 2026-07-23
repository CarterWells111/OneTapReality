import { act, fireEvent, render } from "@testing-library/react-native";

const mockGestureHandlers: Record<string, { begin?: () => void; update?: (event: { scale?: number; translationX?: number; translationY?: number }) => void }> = {};
const mockRunOnJS = jest.fn();
const mockSharedValues: Array<{ value: number }> = [];

jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  const React = require("react");
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (component: unknown) => component },
    runOnJS: (...args: unknown[]) => mockRunOnJS(...args),
    useAnimatedProps: (worklet: () => unknown) => worklet(),
    useAnimatedStyle: (worklet: () => unknown) => worklet(),
    useDerivedValue: (worklet: () => unknown) => {
      const shared = React.useRef(null) as { current: { value: unknown } | null };
      if (shared.current === null) shared.current = { value: worklet() };
      return shared.current;
    },
    useSharedValue: (value: number) => {
      const shared = React.useRef(null) as { current: { value: number } | null };
      if (shared.current === null) {
        shared.current = { value };
        mockSharedValues.push(shared.current);
      }
      return shared.current;
    },
  };
});

jest.mock("react-native-gesture-handler", () => {
  const { View } = require("react-native");
  const createGesture = () => {
    const gesture: Record<string, unknown> = {};
    gesture.enabled = () => gesture;
    gesture.onBegin = (callback: () => void) => { gesture.begin = callback; return gesture; };
    gesture.onUpdate = (callback: (event: { scale?: number; translationX?: number; translationY?: number }) => void) => { gesture.update = callback; return gesture; };
    gesture.onFinalize = () => gesture;
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockSharedValues.splice(0, mockSharedValues.length);
  });

  it("clamps shared pan and pinch values without calling React across gesture frames", async () => {
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
    expect(mockRunOnJS).not.toHaveBeenCalled();
    expect(mockSharedValues[0]?.value).toBe(240);
    expect(mockSharedValues[1]?.value).toBe(-160);

    await act(async () => {
      mockGestureHandlers.pinch.begin?.();
      mockGestureHandlers.pinch.update?.({ scale: 4 });
    });
    expect(mockRunOnJS).not.toHaveBeenCalled();
    expect(mockSharedValues[2]?.value).toBe(3.5);
    const canvasStyle = screen.getByTestId("city-map-workspace-canvas").props.style;
    expect(canvasStyle).toEqual(expect.any(Array));
    expect(canvasStyle[1].transform).toEqual([
      { translateX: expect.any(Number) },
      { translateY: expect.any(Number) },
      { scale: expect.any(Number) },
    ]);
  });
});
