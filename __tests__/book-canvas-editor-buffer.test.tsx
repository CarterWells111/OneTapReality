import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

let finalizePageTurn: ((event: { translationX: number; velocityX: number }) => void) | undefined;
let completePageTurn: ((finished: boolean) => void) | undefined;
const mockMounts = new Map<string, number>();
const mockUnmounts = new Map<string, number>();
const mockCanvasProps = new Map<string, Record<string, unknown>>();

jest.mock("react-native-gesture-handler", () => {
  const React = require("react") as typeof import("react");
  const chain = () => {
    const gesture: Record<string, unknown> = {};
    for (const method of ["enabled", "activeOffsetX", "failOffsetY", "activateAfterLongPress", "onBegin", "onStart", "onUpdate", "onEnd"]) {
      gesture[method] = () => gesture;
    }
    gesture.onFinalize = (callback: typeof finalizePageTurn) => {
      finalizePageTurn = callback;
      return gesture;
    };
    return gesture;
  };
  return {
    Gesture: { Pan: chain },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock("react-native-reanimated", () => {
  const Reanimated = require("react-native-reanimated/mock");
  return {
    ...Reanimated,
    withTiming: (value: number, _config: unknown, callback?: (finished: boolean) => void) => {
      completePageTurn = callback;
      return value;
    },
  };
});

jest.mock("../src/features/canvas/canvas-page", () => ({
  CanvasPage: (props: { layout: { backgroundId?: string } }) => {
    const React = require("react") as typeof import("react");
    const id = props.layout.backgroundId!;
    mockCanvasProps.set(id, props as unknown as Record<string, unknown>);
    React.useEffect(() => {
      mockMounts.set(id, (mockMounts.get(id) ?? 0) + 1);
      return () => { mockUnmounts.set(id, (mockUnmounts.get(id) ?? 0) + 1); };
    }, [id]);
    return null;
  },
}));

import { BookCanvasEditor } from "../src/features/canvas/book-canvas-editor";
import type { StoryPage } from "../src/types/memory";

const page = (id: string, position: number): StoryPage => ({
  id,
  position,
  kind: "photo",
  headline: id,
  body: "",
  layout: { aspectRatio: 0.75, backgroundId: id, elements: [] },
});

describe("BookCanvasEditor page buffer", () => {
  beforeEach(() => {
    mockMounts.clear();
    mockUnmounts.clear();
    mockCanvasProps.clear();
    finalizePageTurn = undefined;
    completePageTurn = undefined;
  });

  it("keeps the incoming canvas mounted when it becomes current", async () => {
    render(<BookCanvasEditor pages={[page("p1", 0), page("p2", 1)]} onPagesChange={() => undefined} />);

    act(() => finalizePageTurn?.({ translationX: -100, velocityX: -700 }));
    expect(mockMounts.get("p2")).toBe(1);

    await act(async () => {
      completePageTurn?.(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockMounts.get("p2")).toBe(1);
    expect(mockUnmounts.get("p2") ?? 0).toBe(0);
  });

  it("withholds interactions from incoming canvas until it becomes current", async () => {
    render(<BookCanvasEditor pages={[page("p1", 0), page("p2", 1)]} onPagesChange={() => undefined} />);

    act(() => finalizePageTurn?.({ translationX: -100, velocityX: -700 }));
    expect(mockCanvasProps.get("p2")).toEqual(expect.objectContaining({ interactive: false }));
    expect(mockCanvasProps.get("p2")?.onSelectElement).toBeUndefined();
    expect(mockCanvasProps.get("p2")?.onTransformEnd).toBeUndefined();
    expect(mockCanvasProps.get("p2")?.onPressBlank).toBeUndefined();

    await act(async () => {
      completePageTurn?.(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockCanvasProps.get("p2")?.interactive).not.toBe(false);
    expect(mockCanvasProps.get("p2")?.onSelectElement).toEqual(expect.any(Function));
    expect(mockCanvasProps.get("p2")?.onTransformEnd).toEqual(expect.any(Function));
    expect(mockCanvasProps.get("p2")?.onPressBlank).toEqual(expect.any(Function));
  });

  it("keeps and commits the same in-flight target by id when pages reorder", async () => {
    const initialPages = [page("p1", 0), page("p2", 1), page("p3", 2)];
    const view = render(<BookCanvasEditor pages={initialPages} onPagesChange={() => undefined} />);

    act(() => finalizePageTurn?.({ translationX: -100, velocityX: -700 }));
    expect(mockMounts.get("p2")).toBe(1);

    view.rerender(
      <BookCanvasEditor
        pages={[page("p3", 0), page("p1", 1), page("p2", 2)]}
        onPagesChange={() => undefined}
      />,
    );
    expect(mockMounts.get("p2")).toBe(1);
    expect(mockUnmounts.get("p2") ?? 0).toBe(0);
    expect(mockCanvasProps.get("p2")?.pageSide).toBe("right");

    await act(async () => {
      completePageTurn?.(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(view.getByTestId("book-page")).toBeTruthy();
    expect(mockCanvasProps.get("p2")?.interactive).toBe(true);
    expect(mockMounts.get("p2")).toBe(1);
    expect(mockUnmounts.get("p2") ?? 0).toBe(0);
  });

  it("cancels an in-flight turn when its target page is deleted", async () => {
    const view = render(
      <BookCanvasEditor pages={[page("p1", 0), page("p2", 1), page("p3", 2)]} onPagesChange={() => undefined} />,
    );

    act(() => finalizePageTurn?.({ translationX: -100, velocityX: -700 }));
    expect(view.getByTestId("book-page-incoming")).toBeTruthy();

    view.rerender(
      <BookCanvasEditor pages={[page("p1", 0), page("p3", 1)]} onPagesChange={() => undefined} />,
    );
    expect(view.queryByTestId("book-page-incoming")).toBeNull();

    await act(async () => {
      completePageTurn?.(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockCanvasProps.get("p1")?.interactive).toBe(true);
    expect(mockCanvasProps.get("p3")?.interactive).not.toBe(true);
  });

  it("ignores an old turn completion after an explicit page-manager jump", async () => {
    const pages = [page("p1", 0), page("p2", 1), page("p3", 2)];
    const view = render(<BookCanvasEditor pages={pages} onPagesChange={() => undefined} />);

    act(() => finalizePageTurn?.({ translationX: -100, velocityX: -700 }));
    const oldCompletion = completePageTurn;

    fireEvent.press(view.getByLabelText("打开页面管理"));
    fireEvent.press(view.getAllByText("打开")[2]);
    await act(async () => {
      oldCompletion?.(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockCanvasProps.get("p3")?.interactive).toBe(true);
    expect(mockCanvasProps.get("p2")?.interactive).not.toBe(true);
  });
});
