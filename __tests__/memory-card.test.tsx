import { render } from "@testing-library/react-native";

import { MemoryCard } from "../src/components/memory-card";

describe("MemoryCard", () => {
  it("shows the title, city, and photo count of a saved memory", async () => {
    const view = await render(
      <MemoryCard
        memory={{
          id: "memory-1",
          title: "我们的西湖周末",
          city: "hangzhou",
          travelDate: "2026-07-22",
          photoUris: ["file://one.jpg", "file://two.jpg"],
          pages: [],
          createdAt: "2026-07-22T10:00:00.000Z",
          updatedAt: "2026-07-22T10:00:00.000Z",
        }}
      />
    );

    expect(view.getByText("我们的西湖周末")).toBeTruthy();
    expect(view.getByText("杭州 · 2 张照片")).toBeTruthy();
  });

  it("renders a local missing-photo placeholder instead of the card image", async () => {
    const view = await render(
      <MemoryCard memory={{ id: "missing", title: "Missing", city: "hangzhou", travelDate: "2026-07-22", photoUris: ["missing-local-photo://card"], pages: [], createdAt: "2026-07-22T00:00:00.000Z", updatedAt: "2026-07-22T00:00:00.000Z" }} />
    );

    expect(view.getByLabelText("本地照片缺失")).toBeTruthy();
  });
});
