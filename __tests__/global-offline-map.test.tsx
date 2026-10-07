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
const mockTapGestures: Array<typeof mockGestureHandlers.pan> = [];
const mockTapMaxDistances: number[] = [];
const mockRunOnJS = jest.fn();
const mockTimingCallbacks: Array<(finished: boolean) => void> = [];
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
    withTiming: (value: unknown, _config?: unknown, callback?: (finished: boolean) => void) => {
      if (callback) mockTimingCallbacks.push(callback);
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
    gesture.maxDistance = (distance: number) => { mockTapMaxDistances.push(distance); return gesture; };
    gesture.maxPointers = (count: number) => { mockPanMaxPointers = count; return gesture; };
    return gesture;
  };
  return {
    Gesture: {
      Pan: () => { const gesture = createGesture(); mockGestureHandlers.pan = gesture; return gesture; },
      Pinch: () => { const gesture = createGesture(); mockGestureHandlers.pinch = gesture; return gesture; },
      Tap: () => {
        const gesture = createGesture();
        mockTapGestures.push(gesture);
        mockGestureHandlers.tap = gesture;
        return gesture;
      },
      Exclusive: (...gestures: unknown[]) => ({ gestures }),
      Simultaneous: (...gestures: unknown[]) => ({ gestures }),
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});


const { GlobalCityMap, globalMapScreenPoint, clampGlobalViewport } = require('../src/features/cities/global-city-map.tsx');
import { createGeographicCity } from '../src/types/city';
import { getCityStats } from '../src/features/cities/city-stats';

const city = createGeographicCity({ name: 'Mountain trip', latitude: 10, longitude: -40 });
const stats = getCityStats([{ city, status: 'saved' }]);

describe('Offline global map gestures and geometry', () => {
 it('can zoom in from world view in a tall mobile viewport', async () => {
  const screen = await render(<GlobalCityMap stats={[]} variant="workspace" />);
  fireEvent(screen.getByTestId('global-map-workspace'), 'layout', { nativeEvent: { layout: { width: 390, height: 844, x: 0, y: 0 } } });
  fireEvent.press(screen.getByLabelText('放大全球地图'));
  const styles = screen.getByTestId('global-map-canvas').props.style;
  const transform = Object.assign({}, ...styles).transform;
  expect(transform.find((item: { scale?: number }) => item.scale !== undefined).scale).toBeCloseTo(2);
 });
 it('wraps huge pans and clamps polar overscroll after zoom gestures', () => {
  const viewport = clampGlobalViewport({ scale: 1, x: 40000, y: 90000 }, { width: 390, height: 844 });
  expect(Math.abs(viewport.x)).toBeLessThanOrEqual(195);
  expect(viewport.y).toBe(97.5);
  expect(clampGlobalViewport({ scale: 999999, x: 0, y: 0 }, { width: 390, height: 844 }).scale).toBe(65536);
 });
 beforeEach(() => { jest.clearAllMocks(); mockSharedValues.splice(0); mockTapGestures.splice(0); mockTimingCallbacks.splice(0); });
 it('finishes only the latest city animation when layout changes at the same zoom', async () => {
  const a = createGeographicCity({ name: 'First stop', latitude: 10, longitude: -40 });
  const b = createGeographicCity({ name: 'Second stop', latitude: -30, longitude: 20 });
  const reached = jest.fn();
  const screen = await render(<GlobalCityMap stats={getCityStats([{ city: a }, { city: b }])} variant="workspace" onTargetReached={reached} />);
  fireEvent(screen.getByTestId('global-map-workspace'), 'layout', { nativeEvent: { layout: { width: 390, height: 844, x: 0, y: 0 } } });
  await act(async () => mockTimingCallbacks.splice(0).forEach(callback => callback(true)));
  await screen.rerender(<GlobalCityMap stats={stats} variant="workspace" targetCity={a} onTargetReached={reached} />);
  const oldCompletion = mockTimingCallbacks.at(-1)!;
  await screen.rerender(<GlobalCityMap stats={stats} variant="workspace" targetCity={b} onTargetReached={reached} />);
  fireEvent(screen.getByTestId('global-map-workspace'), 'layout', { nativeEvent: { layout: { width: 390, height: 800, x: 0, y: 0 } } });
  await act(async () => oldCompletion(true));
  expect(reached).not.toHaveBeenCalled();
  await act(async () => mockTimingCallbacks.at(-1)!(true));
  expect(reached).toHaveBeenCalledTimes(1);
 });
 it('keeps date-line neighbours next to the camera on both sides', () => {
  const size = { width: 390, height: 844 };
  const viewport = { scale: 1, x: -195, y: 0 };
  const a = globalMapScreenPoint({ latitude: -16, longitude: 179 }, viewport, size);
  const b = globalMapScreenPoint({ latitude: -16, longitude: -179 }, viewport, size);
  expect(Math.abs(a.x-b.x)).toBeLessThan(3);
  expect(a.y).toBe(b.y);
 });
 it('shows a saved global marker, navigates on click and returns to world view', async () => {
  const press = jest.fn();
  const screen = await render(<GlobalCityMap stats={stats} variant="workspace" interactive onCityPress={press} />);
  fireEvent(screen.getByTestId('global-map-workspace'), 'layout', { nativeEvent: { layout: { width: 390, height: 844, x: 0, y: 0 } } });
  fireEvent.press(screen.getByLabelText('Mountain trip，已保存 1 册旅行记忆'));
  expect(press).toHaveBeenCalledWith(city);
  fireEvent.press(screen.getByLabelText('查看全球'));
  expect(screen.getByTestId('global-map-content')).toBeTruthy();
  expect(screen.getAllByLabelText(/个地点，点击放大/).length).toBeGreaterThan(1);
 });
 it('keeps gesture updates on the UI thread and resolves clustered markers after the gesture ends', async () => {
  const screen = await render(<GlobalCityMap stats={[]} variant="workspace" interactive />);
  fireEvent(screen.getByTestId('global-map-workspace'), 'layout', { nativeEvent: { layout: { width: 390, height: 844, x: 0, y: 0 } } });
  await act(async () => mockGestureHandlers.pan.begin?.());
  mockRunOnJS.mockClear();
  await act(async () => {
    mockGestureHandlers.pan.update?.({ translationX: 400, translationY: 0 });
    mockGestureHandlers.pan.update?.({ translationX: 800, translationY: 100 });
  });
  expect(mockRunOnJS).not.toHaveBeenCalled();
  await act(async () => mockGestureHandlers.pan.finalize?.());
  expect(mockRunOnJS).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('global-map-content')).toBeTruthy();
 });
 it('supports pinch to city scale without imposing a country boundary', async () => {
  const screen = await render(<GlobalCityMap stats={[]} variant="workspace" />);
  fireEvent(screen.getByTestId('global-map-workspace'), 'layout', { nativeEvent: { layout: { width: 390, height: 844, x: 0, y: 0 } } });
  await act(async () => mockGestureHandlers.pinch.begin?.({ focalX: 195, focalY: 422 }));
  mockRunOnJS.mockClear();
  await act(async () => mockGestureHandlers.pinch.update?.({ scale: 1000, focalX: 195, focalY: 422 }));
  expect(mockRunOnJS).not.toHaveBeenCalled();
  await act(async () => mockGestureHandlers.pinch.finalize?.());
  expect(mockRunOnJS).toHaveBeenCalledTimes(1);
 });
});
