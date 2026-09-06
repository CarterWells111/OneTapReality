import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockCaptureRef = jest.fn();
jest.mock("react-native-view-shot", () => ({ captureRef: (...args: unknown[]) => mockCaptureRef(...args) }));

import { PageCaptureProvider, capturePagesAsImages } from "../src/features/export/page-capture-provider";
import type { StoryPage } from "../src/types/memory";

const imagePage = (id = "page-1"): StoryPage => ({
  id, position: 0, kind: "photo", headline: "", body: "",
  layout: { aspectRatio: 0.75, elements: [
    { id: "photo", type: "image", uri: "file:///photo.jpg", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0 },
  ] },
});

describe("PageCaptureProvider", () => {
  async function flushCompositionFrames() {
    await act(async () => { jest.advanceTimersByTime(0); await Promise.resolve(); });
    await act(async () => { jest.advanceTimersByTime(0); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockCaptureRef.mockResolvedValue("data:image/jpeg;base64,page");
    jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => setTimeout(() => callback(0), 0) as unknown as number);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("waits for every asset before two composition frames and JPEG capture", async () => {
    render(<PageCaptureProvider><></></PageCaptureProvider>);
    let result!: Promise<(string | null)[]>;
    act(() => { result = capturePagesAsImages([imagePage()], 360, 480); });
    await act(async () => { jest.advanceTimersByTime(500); });
    expect(mockCaptureRef).not.toHaveBeenCalled();

    fireEvent(screen.getByTestId("canvas-image-photo"), "onDisplay");
    await flushCompositionFrames();

    await expect(result).resolves.toEqual(["data:image/jpeg;base64,page"]);
    expect(mockCaptureRef).toHaveBeenCalledWith(expect.anything(), {
      width: 720, height: 960, format: "jpg", quality: 0.8, result: "data-uri",
    });
  });

  it("rejects an asset error and does not attempt later pages", async () => {
    render(<PageCaptureProvider><></></PageCaptureProvider>);
    let result!: Promise<(string | null)[]>;
    act(() => { result = capturePagesAsImages([imagePage("first"), imagePage("second")], 360, 480); });
    const rejection = expect(result).rejects.toThrow("第 1 页有图片无法加载，PDF 未生成");
    fireEvent(screen.getByTestId("canvas-image-photo"), "onError", { nativeEvent: { error: "missing" } });
    await rejection;
    expect(mockCaptureRef).not.toHaveBeenCalled();
  });

  it("captures an asset-free layout after two frames and times out missing assets", async () => {
    render(<PageCaptureProvider><></></PageCaptureProvider>);
    const empty: StoryPage = { ...imagePage(), layout: { aspectRatio: 0.75, elements: [] } };
    let emptyResult!: Promise<(string | null)[]>;
    act(() => { emptyResult = capturePagesAsImages([empty], 360, 480); });
    await flushCompositionFrames();
    await expect(emptyResult).resolves.toEqual(["data:image/jpeg;base64,page"]);

    let timeoutResult!: Promise<(string | null)[]>;
    act(() => { timeoutResult = capturePagesAsImages([imagePage()], 360, 480); });
    const timeoutRejection = expect(timeoutResult).rejects.toThrow("第 1 页图片加载超时，PDF 未生成");
    await act(async () => { jest.advanceTimersByTime(10_000); });
    await timeoutRejection;
  });
});
