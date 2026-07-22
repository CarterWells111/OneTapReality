import { validateMemoryDraft } from "../src/features/memories/validation";

describe("validateMemoryDraft", () => {
  const validInput = {
    title: "我们的西湖周末",
    city: "hangzhou" as const,
    travelDate: "2026-07-22",
    photoUris: ["file://west-lake.jpg"],
  };

  it("accepts a titled memory with a supported city and at least one photo", () => {
    expect(validateMemoryDraft(validInput)).toEqual({ issues: [] });
  });

  it("reports title and photo errors for an incomplete memory", () => {
    expect(
      validateMemoryDraft({ ...validInput, title: "  ", photoUris: [] })
    ).toEqual({ issues: ["请输入纪念册标题", "请至少选择一张照片"] });
  });
});
