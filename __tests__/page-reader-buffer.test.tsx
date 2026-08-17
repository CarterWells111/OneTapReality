import * as React from "react";
import { render } from "@testing-library/react-native";

const mockMounts = new Map<string, number>();
const mockUnmounts = new Map<string, number>();

jest.mock("../src/features/canvas/canvas-page", () => ({
  CanvasPage: ({ layout }: { layout: { backgroundId?: string } }) => {
    const React = require("react") as typeof import("react");
    const id = layout.backgroundId!;
    React.useEffect(() => {
      mockMounts.set(id, (mockMounts.get(id) ?? 0) + 1);
      return () => { mockUnmounts.set(id, (mockUnmounts.get(id) ?? 0) + 1); };
    }, [id]);
    return null;
  },
}));

import { PageReaderLayerBuffer } from "../src/features/canvas/page-reader";
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
