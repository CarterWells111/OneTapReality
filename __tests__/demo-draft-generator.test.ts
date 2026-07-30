import { DemoDraftGenerator } from "../src/services/ai/demo-draft-generator";

describe("DemoDraftGenerator", () => {
  it("creates a cover, one local page per photo, and a closing page without network input", async () => {
    const generator = new DemoDraftGenerator();

    const pages = await generator.generate({
      title: "我们的西湖周末",
      city: "hangzhou",
      travelDate: "2026-07-22",
      photoUris: ["file://first.jpg", "file://second.jpg"],
    });

    expect(pages).toHaveLength(4);
    expect(pages.map((page) => page.kind)).toEqual([
      "cover",
      "photo",
      "photo",
      "closing",
    ]);
    expect(pages[1].photoUri).toBe("file://first.jpg");
    expect(pages[2].photoUri).toBe("file://second.jpg");
    expect(pages[0].headline).toBe("我们的西湖周末");
  });

  it("creates local fixed copy for an expanded registry city", async () => {
    const pages = await new DemoDraftGenerator().generate({
      title: "北京周末",
      city: "beijing",
      travelDate: "2026-07-23",
      photoUris: [],
    });

    expect(pages[0].body).toContain("北京");
  });
});
