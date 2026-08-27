import { DemoDraftGenerator } from "../src/services/ai/demo-draft-generator";
import type { MemoryDraftInput } from "../src/types/memory";

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

  it("generates planned photo pages with ordered images, matching templates, and legacy text", async () => {
    const input: MemoryDraftInput = {
      title: "模板周末",
      city: "hangzhou",
      travelDate: "2026-07-24",
      photoUris: ["file://one.jpg", "file://two.jpg", "file://three.jpg"],
      pagePlans: [
        { photoUris: ["file://one.jpg", "file://two.jpg"], photoTemplateId: "classic-2" },
        { photoUris: ["file://three.jpg"], photoTemplateId: "story-1" },
      ],
    };

    const pages = await new DemoDraftGenerator().generate(input);

    expect(pages.map(({ id, position, kind }) => ({ id, position, kind }))).toEqual([
      { id: "cover", position: 0, kind: "cover" },
      { id: "photo-1", position: 1, kind: "photo" },
      { id: "photo-2", position: 2, kind: "photo" },
      { id: "closing", position: 3, kind: "closing" },
    ]);
    expect(pages[1]).toMatchObject({
      photoUri: "file://one.jpg",
      headline: "把这一刻留住",
      body: "我们选了 3 张照片，记录这段只属于我们的旅程。",
      layout: { photoTemplateId: "classic-2" },
    });
    expect(pages[2]).toMatchObject({
      photoUri: "file://three.jpg",
      layout: { photoTemplateId: "story-1" },
    });

    expect(pages[1].layout?.elements.filter((element) => element.type === "image").map((element) => element.uri)).toEqual([
      "file://one.jpg",
      "file://two.jpg",
    ]);
    expect(pages[1].layout?.elements.filter((element) => element.type === "text").map((element) => element.text)).toEqual([
      "把这一刻留住",
      "我们选了 3 张照片，记录这段只属于我们的旅程。",
    ]);
    expect(pages[1].layout?.elements.map((element) => element.zIndex)).toEqual([1, 2, 3, 4]);
  });

  it("falls back to freeform layout and omits a bad or count-mismatched template", async () => {
    const pages = await new DemoDraftGenerator().generate({
      title: "自由排版",
      city: "shanghai",
      travelDate: "2026-07-25",
      photoUris: ["file://one.jpg", "file://two.jpg", "file://three.jpg"],
      pagePlans: [
        { photoUris: ["file://one.jpg"], photoTemplateId: "not-a-template" as never },
        { photoUris: ["file://two.jpg", "file://three.jpg"], photoTemplateId: "classic-1" },
      ],
    });

    expect(pages[1].layout).not.toHaveProperty("photoTemplateId");
    expect(pages[2].layout).not.toHaveProperty("photoTemplateId");
    expect(pages[1].layout?.elements.filter((element) => element.type === "image")).toHaveLength(1);
    expect(pages[2].layout?.elements.filter((element) => element.type === "image")).toHaveLength(2);
  });

  it("keeps legacy one-photo pages when page plans are absent or empty", async () => {
    const base = {
      title: "兼容旧草稿",
      city: "shenzhen" as const,
      travelDate: "2026-07-26",
      photoUris: ["file://one.jpg", "file://two.jpg"],
    };
    const generator = new DemoDraftGenerator();

    const withoutPlans = await generator.generate(base);
    const withEmptyPlans = await generator.generate({ ...base, pagePlans: [] });

    expect(withEmptyPlans).toEqual(withoutPlans);
    expect(withoutPlans[1]).toEqual({
      id: "photo-1",
      position: 1,
      kind: "photo",
      headline: "把这一刻留住",
      body: "我们选了 2 张照片，记录这段只属于我们的旅程。",
      photoUri: "file://one.jpg",
    });
  });

  it("does not mutate page plans or their photo URI arrays", async () => {
    const input: MemoryDraftInput = {
      title: "不可变草稿",
      city: "hangzhou",
      travelDate: "2026-07-27",
      photoUris: ["file://one.jpg", "file://two.jpg"],
      pagePlans: [{ photoUris: ["file://one.jpg", "file://two.jpg"], photoTemplateId: "classic-2" }],
    };
    const before = structuredClone(input);

    await new DemoDraftGenerator().generate(input);

    expect(input).toEqual(before);
  });
});
