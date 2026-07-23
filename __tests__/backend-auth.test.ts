import {
  createAccessToken,
  extractBearerToken,
  hashAccessToken,
} from "../src/server/auth/device-auth";

describe("anonymous device authentication", () => {
  it("extracts only a bearer token", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
    expect(extractBearerToken("Basic abc123")).toBeNull();
    expect(extractBearerToken(null)).toBeNull();
  });

  it("hashes the same token deterministically with a server pepper", async () => {
    const first = await hashAccessToken("abc123", "test-pepper");
    const second = await hashAccessToken("abc123", "test-pepper");
    const differentPepper = await hashAccessToken("abc123", "other-pepper");

    expect(first).toBe(second);
    expect(first).not.toBe(differentPepper);
  });

  it("creates a non-empty opaque token", () => {
    expect(createAccessToken()).toEqual(expect.any(String));
    expect(createAccessToken()).not.toBe(createAccessToken());
  });
});
