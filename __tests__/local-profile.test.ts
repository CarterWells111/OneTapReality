import {
  DEFAULT_BIO,
  DEFAULT_LOCAL_PROFILE,
  maxBioLength,
  normalizeBio,
  normalizeNickname,
} from "../src/features/profile/local-profile";

describe("local profile", () => {
  it("provides the default local profile", () => {
    expect(DEFAULT_LOCAL_PROFILE).toEqual({
      nickname: "一触如初用户",
      avatarUri: null,
      bio: DEFAULT_BIO,
    });
  });

  it("normalizes a nickname by trimming surrounding spaces", () => {
    expect(normalizeNickname("  小林  ")).toBe("小林");
  });

  it("uses the default nickname for an empty value", () => {
    expect(normalizeNickname(" ")).toBe("一触如初用户");
  });

  it("normalizes a bio by trimming surrounding spaces", () => {
    expect(normalizeBio("  记录每一次出发  ")).toBe("记录每一次出发");
  });

  it("uses the brand slogan for an empty bio", () => {
    expect(normalizeBio("   ")).toBe(DEFAULT_BIO);
  });

  it("caps overly long bios at the maximum length", () => {
    expect(normalizeBio("旅".repeat(maxBioLength + 10))).toHaveLength(maxBioLength);
  });
});
