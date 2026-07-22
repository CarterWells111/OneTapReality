import { DemoDraftGenerator } from "../src/services/ai/demo-draft-generator";

describe("DemoDraftGenerator", () => {
  it("creates a cover, photo page, and closing page without network input", async () => {
    const generator = new DemoDraftGenerator();

    const pages = await generator.generate({
      title: "我们的西湖周末",
      city: "hangzhou",
      travelDate: "2026-07-22",
      photoUris: ["file://first.jpg", "file://second.jpg"],
    });

    expect(pages).toHaveLength(3);
    expect(pages.map((page) => page.kind)).toEqual([
      "cover",
      "photo",
      "closing",
    ]);
    expect(pages[1].photoUri).toBe("file://first.jpg");
    expect(pages[0].headline).toBe("我们的西湖周末");
  });
});
