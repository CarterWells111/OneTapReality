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
});
