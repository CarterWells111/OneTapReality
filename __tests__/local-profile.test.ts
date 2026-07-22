import { DEFAULT_LOCAL_PROFILE, normalizeNickname } from "../src/features/profile/local-profile";

describe("local profile", () => {
  it("provides the default local profile", () => {
    expect(DEFAULT_LOCAL_PROFILE).toEqual({ nickname: "旅忆用户", avatarUri: null });
  });

  it("normalizes a nickname by trimming surrounding spaces", () => {
    expect(normalizeNickname("  小林  ")).toBe("小林");
  });

  it("uses the default nickname for an empty value", () => {
    expect(normalizeNickname(" ")).toBe("旅忆用户");
  });
});
