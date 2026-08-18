import * as React from "react";
import { act, render } from "@testing-library/react-native";

jest.mock("react-native-view-shot", () => ({
  captureRef: jest.fn(),
}));

jest.mock("../src/features/canvas/canvas-page", () => ({
  CanvasPage: () => null,
}));

import { capturePagesAsImages, PageCaptureProvider } from "../src/features/export/page-capture-provider";

const { captureRef: mockCaptureRef } = jest.requireMock("react-native-view-shot") as {
  captureRef: jest.Mock;
};

describe("PageCaptureProvider", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockCaptureRef.mockResolvedValue("data:image/png;base64,test");
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("captures a canvas page at its original resolution", async () => {
    render(<PageCaptureProvider><></></PageCaptureProvider>);

    let capture: Promise<(string | null)[]>;
    await act(async () => {
      capture = capturePagesAsImages([
        {
          id: "page-1",
          kind: "cover",
          headline: "Summer",
          body: "Hangzhou",
          position: 0,
          layout: { aspectRatio: 3 / 4, coverColor: "#EFE2CF", elements: [] },
        },
      ], 360, 480);
    });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
    await capture!;

    expect(mockCaptureRef).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ width: 360, height: 480 }),
    );
  });
});
