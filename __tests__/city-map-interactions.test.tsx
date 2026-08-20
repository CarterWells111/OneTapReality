import { act, fireEvent, render } from "@testing-library/react-native";

type MockGestureEvent = {
  focalX?: number;
  focalY?: number;
  scale?: number;
  translationX?: number;
  translationY?: number;
  velocityX?: number;
  velocityY?: number;
  x?: number;
  y?: number;
};

const mockGestureHandlers: Record<string, {
  begin?: (event?: MockGestureEvent) => void;
  update?: (event: MockGestureEvent) => void;
  finalize?: (event?: MockGestureEvent) => void;
  end?: (event?: MockGestureEvent, success?: boolean) => void;
}> = {};
const mockRunOnJS = jest.fn();
const mockSharedValues: Array<{ value: unknown }> = [];
const mockDecayConfigs: Array<{ clamp?: readonly [number, number]; velocity?: number }> = [];
const mockDecayCallbacks: Array<(finished?: boolean) => void> = [];
let mockAnimatedReactionCalls = 0;
let mockPanMaxPointers: number | undefined;

jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  const React = require("react");
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (component: unknown) => component },
    runOnJS: (worklet: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
      mockRunOnJS(worklet, ...args);
      return worklet(...args);
    },
    useAnimatedProps: (worklet: () => unknown) => worklet(),
    useAnimatedStyle: (worklet: () => unknown) => worklet(),
    useAnimatedReaction: (prepare: () => unknown, react: (current: unknown, previous: unknown) => void) => {
      mockAnimatedReactionCalls += 1;
      react(prepare(), null);
    },
    useSharedValue: (value: unknown) => {
      const shared = React.useRef(null) as { current: { value: unknown } | null };
      if (shared.current === null) {
        shared.current = { value };
        mockSharedValues.push(shared.current);
      }
      return shared.current;
    },
    FadeIn: { duration: () => undefined },
    FadeOut: { duration: () => undefined },
    withDecay: (config: { clamp?: readonly [number, number]; velocity?: number }, callback?: (finished?: boolean) => void) => {
      mockDecayConfigs.push(config);
      if (callback) mockDecayCallbacks.push(callback);
      if (!config.clamp) return config.velocity ?? 0;
      return Math.min(Math.max(config.velocity ?? 0, config.clamp[0]), config.clamp[1]);
    },
    withTiming: (value: unknown, _config?: unknown, callback?: () => void) => {
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
    gesture.onBegin = (callback: (event?: MockGestureEvent) => void) => { gesture.begin = callback; return gesture; };
    gesture.onUpdate = (callback: (event: MockGestureEvent) => void) => { gesture.update = callback; return gesture; };
    gesture.onFinalize = (callback: (event?: MockGestureEvent) => void) => { gesture.finalize = callback; return gesture; };
    gesture.onEnd = (callback: (event?: MockGestureEvent, success?: boolean) => void) => { gesture.end = callback; return gesture; };
    gesture.numberOfTaps = () => gesture;
    gesture.maxDelay = () => gesture;
    gesture.maxPointers = (count: number) => { mockPanMaxPointers = count; return gesture; };
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

import { CityMap, getWorkspaceTranslationLimits, type CityStats } from "../src/features/cities";

const stats: CityStats[] = [
  { city: "hangzhou", intensity: "none", isVisited: false, unlocked: false, visitCount: 0 },
  { city: "shanghai", intensity: "none", isVisited: false, unlocked: false, visitCount: 0 },
  { city: "shenzhen", intensity: "none", isVisited: false, unlocked: false, visitCount: 0 },
];

describe("CityMap workspace gestures", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSharedValues.splice(0, mockSharedValues.length);
    mockDecayConfigs.splice(0, mockDecayConfigs.length);
    mockDecayCallbacks.splice(0, mockDecayCallbacks.length);
    mockAnimatedReactionCalls = 0;
    mockPanMaxPointers = undefined;
  });

  it("does not start the UI-thread label worklet for the static overview map", async () => {
    await render(<CityMap stats={stats} variant="overview" />);

    expect(mockAnimatedReactionCalls).toBe(0);
  });

  it("does not rebuild the full label catalog in a UI-thread reaction", async () => {
    await render(<CityMap initialCity="shenzhen" stats={stats} variant="workspace" />);

    expect(mockAnimatedReactionCalls).toBe(0);
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
    const limits = getWorkspaceTranslationLimits(2, { height: 320, width: 480 });
    expect(mockRunOnJS).not.toHaveBeenCalled();
    expect(mockSharedValues[0]?.value).toBe(limits.x);
    expect(mockSharedValues[1]?.value).toBe(-limits.y);

    await act(async () => {
      mockGestureHandlers.pinch.begin?.({ focalX: 240, focalY: 160 });
      mockGestureHandlers.pinch.update?.({ focalX: 240, focalY: 160, scale: 4 });
    });
    expect(mockRunOnJS).not.toHaveBeenCalled();
    expect(mockSharedValues[2]?.value).toBe(6);
    const canvasStyle = screen.getByTestId("city-map-workspace-canvas").props.style;
    expect(canvasStyle).toEqual(expect.any(Array));
    expect(canvasStyle[1].transform).toEqual([
      { translateX: expect.any(Number) },
      { translateY: expect.any(Number) },
      { scale: expect.any(Number) },
    ]);
  });

  it("keeps the pinch focal point anchored while scaling", async () => {
    const screen = await render(<CityMap stats={stats} variant="workspace" />);
    await act(async () => {
      fireEvent(screen.getByTestId("city-map-workspace"), "layout", {
        nativeEvent: { layout: { height: 320, width: 480, x: 0, y: 0 } },
      });
    });

    await act(async () => {
      mockGestureHandlers.pinch.begin?.({ focalX: 360, focalY: 240 });
      mockGestureHandlers.pinch.update?.({ focalX: 360, focalY: 240, scale: 2 });
    });

    expect(mockSharedValues[2]?.value).toBe(2);
    expect(mockSharedValues[0]?.value).toBe(-120);
    expect(mockSharedValues[1]?.value).toBe(-80);
    expect(mockRunOnJS).not.toHaveBeenCalled();
  });

  it("starts bounded short-distance decay and refreshes labels only after it settles", async () => {
    const screen = await render(<CityMap initialCity="shenzhen" stats={stats} variant="workspace" />);
    await act(async () => {
      fireEvent(screen.getByTestId("city-map-workspace"), "layout", {
        nativeEvent: { layout: { height: 320, width: 480, x: 0, y: 0 } },
      });
    });

    await act(async () => {
      mockGestureHandlers.pan.begin?.();
      mockGestureHandlers.pan.update?.({ translationX: 30, translationY: -20 });
      mockGestureHandlers.pan.end?.({ velocityX: 900, velocityY: -700 }, true);
    });

    expect(mockDecayConfigs).toEqual([
      expect.objectContaining({ clamp: [-getWorkspaceTranslationLimits(2, { height: 320, width: 480 }).x, getWorkspaceTranslationLimits(2, { height: 320, width: 480 }).x], velocity: expect.any(Number) }),
      expect.objectContaining({ clamp: [-getWorkspaceTranslationLimits(2, { height: 320, width: 480 }).y, getWorkspaceTranslationLimits(2, { height: 320, width: 480 }).y], velocity: expect.any(Number) }),
    ]);
    expect(Math.abs(mockDecayConfigs[0].velocity ?? 0)).toBeLessThanOrEqual(1600);
    expect(Math.abs(mockDecayConfigs[1].velocity ?? 0)).toBeLessThanOrEqual(1600);
    expect(mockRunOnJS).not.toHaveBeenCalled();
    await act(async () => {
      mockDecayCallbacks[1]?.(true);
    });
    expect(mockRunOnJS).not.toHaveBeenCalled();
    await act(async () => {
      mockDecayCallbacks[0]?.(true);
    });
    expect(mockRunOnJS).toHaveBeenCalledTimes(1);
  });

  it("waits for a horizontal decay to settle and ignores cancelled pan animations", async () => {
    const screen = await render(<CityMap stats={stats} variant="workspace" />);
    await act(async () => {
      fireEvent(screen.getByTestId("city-map-workspace"), "layout", {
        nativeEvent: { layout: { height: 320, width: 480, x: 0, y: 0 } },
      });
      mockGestureHandlers.pan.begin?.();
      mockGestureHandlers.pan.end?.({ velocityX: 900, velocityY: 0 }, true);
    });

    await act(async () => {
      mockDecayCallbacks[1]?.(true);
    });
    expect(mockRunOnJS).not.toHaveBeenCalled();
    await act(async () => {
      mockDecayCallbacks[0]?.(true);
    });
    expect(mockRunOnJS).toHaveBeenCalledTimes(1);

    mockRunOnJS.mockClear();
    mockDecayConfigs.splice(0, mockDecayConfigs.length);
    mockDecayCallbacks.splice(0, mockDecayCallbacks.length);
    await act(async () => {
      mockGestureHandlers.pan.end?.({ velocityX: 500, velocityY: 400 }, false);
    });
    expect(mockDecayConfigs).toHaveLength(0);
    expect(mockRunOnJS).not.toHaveBeenCalled();
  });

  it("does not refresh labels when either pan decay axis is interrupted", async () => {
    const screen = await render(<CityMap stats={stats} variant="workspace" />);
    await act(async () => {
      fireEvent(screen.getByTestId("city-map-workspace"), "layout", {
        nativeEvent: { layout: { height: 320, width: 480, x: 0, y: 0 } },
      });
      mockGestureHandlers.pan.begin?.();
      mockGestureHandlers.pan.end?.({ velocityX: 700, velocityY: 600 }, true);
      mockDecayCallbacks[0]?.(false);
      mockDecayCallbacks[1]?.(true);
    });
    expect(mockRunOnJS).not.toHaveBeenCalled();
  });

  it("limits pan to one pointer so pinch exclusively owns two-finger translation", async () => {
    await render(<CityMap stats={stats} variant="workspace" />);

    expect(mockPanMaxPointers).toBe(1);
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

  it("cycles double-tap zoom through 2x, 4x, 6x, then returns to 1x", async () => {
    const screen = await render(<CityMap stats={stats} variant="workspace" />);
    await act(async () => {
      fireEvent(screen.getByTestId("city-map-workspace"), "layout", {
        nativeEvent: { layout: { height: 320, width: 480, x: 0, y: 0 } },
      });
    });

    const scales: unknown[] = [];
    for (let tap = 0; tap < 4; tap += 1) {
      await act(async () => {
        mockGestureHandlers.tap.end?.({ x: 240, y: 160 }, true);
      });
      scales.push(mockSharedValues[2]?.value);
    }

    expect(scales).toEqual([2, 4, 6, 1]);
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
