import * as React from "react";
import { act, render } from "@testing-library/react-native";

let mockFinalizePageTurn: ((event: { translationX: number; velocityX: number }) => void) | undefined;
let mockCompletePageTurn: ((finished: boolean) => void) | undefined;

jest.mock("react-native-gesture-handler", () => {
  const React = require("react") as typeof import("react");
  const chain = () => {
    const gesture: Record<string, unknown> = {};
    for (const method of ["enabled", "activeOffsetX", "failOffsetY", "onUpdate"]) {
      gesture[method] = () => gesture;
    }
    gesture.onFinalize = (callback: typeof mockFinalizePageTurn) => {
      mockFinalizePageTurn = callback;
      return gesture;
    };
    return gesture;
  };
  return {
    Gesture: { Pan: chain },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock("react-native-reanimated", () => {
  const Reanimated = require("react-native-reanimated/mock");
  return {
    ...Reanimated,
    withTiming: (value: number, _config: unknown, callback?: (finished: boolean) => void) => {
      mockCompletePageTurn = callback;
      return value;
    },
  };
});

const mockMounts = new Map<string, number>();
const mockUnmounts = new Map<string, number>();

jest.mock("../src/features/canvas/canvas-page", () => ({
  CanvasPage: ({ layout }: { layout: { backgroundId?: string } }) => {
    const React = require("react") as typeof import("react");
    const { Text } = require("react-native") as typeof import("react-native");
    const id = layout.backgroundId!;
    React.useEffect(() => {
      mockMounts.set(id, (mockMounts.get(id) ?? 0) + 1);
      return () => { mockUnmounts.set(id, (mockUnmounts.get(id) ?? 0) + 1); };
    }, [id]);
    return <Text>{id}</Text>;
  },
}));

import { PageReader, PageReaderLayerBuffer } from "../src/features/canvas/page-reader";
import type { StoryPage } from "../src/types/memory";

const page = (id: string, position: number): StoryPage => ({
  id,
  position,
  kind: "photo",
  headline: id,
  body: "",
  layout: { aspectRatio: 0.75, backgroundId: id, elements: [] },
});

describe("PageReaderLayerBuffer", () => {
  beforeEach(() => { mockMounts.clear(); mockUnmounts.clear(); });

  it("keeps the already-rendered incoming Canvas mounted when it becomes current", () => {
    const first = page("first", 0);
    const second = page("second", 1);
    const view = render(
      <PageReaderLayerBuffer current={first} currentIsRight incoming={second} incomingIsRight={false} pageHeight={400} pageWidth={300} />,
    );
    expect(mockMounts.get("second")).toBe(1);

    view.rerender(
      <PageReaderLayerBuffer current={second} currentIsRight={false} pageHeight={400} pageWidth={300} />,
    );

    expect(mockMounts.get("second")).toBe(1);
    expect(mockUnmounts.get("second") ?? 0).toBe(0);
  });
});

describe("PageReader restoration", () => {
  it("opens the page selected by stable page id", () => {
    const view = render(
      <PageReader pages={[page("p1", 0), page("p2", 1)]} initialPageId="p2" fallbackIndex={0} />,
    );

    expect(view.getByTestId("reader-page")).toHaveTextContent("p2");
  });

  it("clamps the fallback index when the restored page later disappears", () => {
    const view = render(
      <PageReader pages={[page("p1", 0), page("p2", 1), page("p3", 2)]} initialPageId="p2" fallbackIndex={9} />,
    );

    view.rerender(
      <PageReader pages={[page("p1", 0), page("p3", 1)]} initialPageId="p2" fallbackIndex={9} />,
    );

    expect(view.getByTestId("reader-page")).toHaveTextContent("p3");
  });

  it("keeps the manually selected page across ordinary pages identity and content updates", async () => {
    const view = render(
      <PageReader pages={[page("p1", 0), page("p2", 1), page("p3", 2)]} />,
    );

    await act(async () => {
      mockFinalizePageTurn?.({ translationX: -100, velocityX: -700 });
      mockCompletePageTurn?.(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(view.getByTestId("reader-page")).toHaveTextContent("p2");

    view.rerender(
      <PageReader pages={[page("p1", 0), { ...page("p2", 1), body: "updated" }, page("p3", 2)]} />,
    );

    expect(view.getByTestId("reader-page")).toHaveTextContent("p2");
  });

  it("repositions when restoration props change", () => {
    const pages = [page("p1", 0), page("p2", 1), page("p3", 2)];
    const view = render(<PageReader pages={pages} initialPageId="p1" fallbackIndex={0} />);

    view.rerender(<PageReader pages={pages} initialPageId="p3" fallbackIndex={0} />);

    expect(view.getByTestId("reader-page")).toHaveTextContent("p3");
  });

  it("repositions when the restoration key changes but target props stay the same", async () => {
    const pages = [page("p1", 0), page("p2", 1), page("p3", 2)];
    const view = render(
      <PageReader pages={pages} initialPageId="p1" fallbackIndex={0} restorationKey={0} />,
    );

    await act(async () => {
      mockFinalizePageTurn?.({ translationX: -100, velocityX: -700 });
      mockCompletePageTurn?.(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(view.getByTestId("reader-page")).toHaveTextContent("p2");

    view.rerender(
      <PageReader pages={pages} initialPageId="p1" fallbackIndex={0} restorationKey={1} />,
    );

    expect(view.getByTestId("reader-page")).toHaveTextContent("p1");
  });

  it("commits an in-flight turn by page id after pages reorder", async () => {
    const initialPages = [page("p1", 0), page("p2", 1), page("p3", 2)];
    const view = render(<PageReader pages={initialPages} />);

    act(() => {
      mockFinalizePageTurn?.({ translationX: -100, velocityX: -700 });
    });
    expect(view.getByTestId("reader-page-incoming")).toHaveTextContent("p2");

    view.rerender(<PageReader pages={[page("p3", 0), page("p1", 1), page("p2", 2)]} />);
    await act(async () => {
      mockCompletePageTurn?.(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(view.getByTestId("reader-page")).toHaveTextContent("p2");
  });

  it("cancels an in-flight turn when its target page disappears", () => {
    const view = render(<PageReader pages={[page("p1", 0), page("p2", 1), page("p3", 2)]} />);

    act(() => {
      mockFinalizePageTurn?.({ translationX: -100, velocityX: -700 });
    });
    view.rerender(<PageReader pages={[page("p1", 0), page("p3", 1)]} />);

    expect(view.queryByTestId("reader-page-incoming")).toBeNull();
    expect(view.getByTestId("reader-page")).toHaveTextContent("p1");
  });

  it("ignores an old turn completion after explicit restoration changes", async () => {
    const pages = [page("p1", 0), page("p2", 1), page("p3", 2)];
    const view = render(<PageReader pages={pages} initialPageId="p1" />);

    act(() => {
      mockFinalizePageTurn?.({ translationX: -100, velocityX: -700 });
    });
    const oldCompletion = mockCompletePageTurn;

    view.rerender(<PageReader pages={pages} initialPageId="p3" />);
    await act(async () => {
      oldCompletion?.(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(view.getByTestId("reader-page")).toHaveTextContent("p3");
  });
});
