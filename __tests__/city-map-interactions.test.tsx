import { act, fireEvent, render } from "@testing-library/react-native";

const mockGestureHandlers: Record<string, { begin?: () => void; update?: (event: { scale?: number; translationX?: number; translationY?: number }) => void; end?: (event?: unknown, success?: boolean) => void }> = {};
const mockRunOnJS = jest.fn();
const mockSharedValues: Array<{ value: number }> = [];
let mockDerivedValueCalls = 0;

jest.mock("react-native-reanimated", () => {
  const { Text, View } = require("react-native");
  const React = require("react");
  return {
    __esModule: true,
    default: {
      View,
      Text,
      createAnimatedComponent: (component: unknown) => component,
    },
    Extrapolation: { CLAMP: "clamp" },
    interpolate: (value: number, input: number[], output: number[], _extrapolation?: unknown) => {
      const ratio = (value - input[0]) / (input[1] - input[0]);
      return output[0] + (output[1] - output[0]) * Math.max(0, Math.min(1, ratio));
    },
    runOnJS: (worklet: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
      mockRunOnJS(worklet, ...args);
      return worklet(...args);
    },
    useAnimatedProps: (worklet: () => unknown) => worklet(),
    useAnimatedStyle: (worklet: () => unknown) => worklet(),
    useDerivedValue: (worklet: () => unknown) => {
      mockDerivedValueCalls += 1;
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
    withTiming: (value: number, _config?: unknown, callback?: () => void) => {
      callback?.();
      return value;
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
    gesture.onEnd = (callback: (event?: unknown, success?: boolean) => void) => { gesture.end = callback; return gesture; };
    gesture.numberOfTaps = () => gesture;
    gesture.maxDelay = () => gesture;
    return gesture;
  };
  return {
    Gesture: {
      Pan: () => { const gesture = createGesture(); mockGestureHandlers.pan = gesture; return gesture; },
      Pinch: () => { const gesture = createGesture(); mockGestureHandlers.pinch = gesture; return gesture; },
      Tap: () => { const gesture = createGesture(); mockGestureHandlers.tap = gesture; return gesture; },
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
    mockDerivedValueCalls = 0;
  });

  it("does not start the UI-thread label worklet for the static overview map", async () => {
    await render(<CityMap stats={stats} variant="overview" />);

    expect(mockDerivedValueCalls).toBe(0);
  });

  it("does not start a derived UI-thread worklet when the fullscreen map opens", async () => {
    await render(<CityMap initialCity="shenzhen" stats={stats} variant="workspace" />);

    expect(mockDerivedValueCalls).toBe(0);
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

  // 画布 transform 以视图中心为原点缩放，双击定焦必须按 (点 - 中心) 计算，
  // 否则每次双击都会把地图整体甩出半个视口。
  it("keeps the double-tapped point anchored when zooming from the viewport centre", async () => {
    const screen = await render(<CityMap stats={stats} variant="workspace" />);
    await act(async () => {
      fireEvent(screen.getByTestId("city-map-workspace"), "layout", {
        nativeEvent: { layout: { height: 320, width: 480, x: 0, y: 0 } },
      });
    });
    expect([mockSharedValues[0]?.value, mockSharedValues[1]?.value, mockSharedValues[2]?.value]).toEqual([0, 0, 1]);

    await act(async () => {
      mockGestureHandlers.tap.end?.({ x: 240, y: 160 }, true);
    });

    expect(mockSharedValues[2]?.value).toBe(2);
    expect(mockSharedValues[0]?.value).toBe(0);
    expect(mockSharedValues[1]?.value).toBe(0);
  });

  it("shifts the canvas toward an off-centre double tap instead of slamming into the clamp", async () => {
    const screen = await render(<CityMap stats={stats} variant="workspace" />);
    await act(async () => {
      fireEvent(screen.getByTestId("city-map-workspace"), "layout", {
        nativeEvent: { layout: { height: 320, width: 480, x: 0, y: 0 } },
      });
    });

    await act(async () => {
      mockGestureHandlers.tap.end?.({ x: 360, y: 240 }, true);
    });

    // 目标点相对中心偏移 (120, 80)，放大 2 倍后需反向平移同样的偏移量
    expect(mockSharedValues[2]?.value).toBe(2);
    expect(mockSharedValues[0]?.value).toBe(-120);
    expect(mockSharedValues[1]?.value).toBe(-80);
  });
});
