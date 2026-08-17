import { localAccountDirectorySegment, normalizeLocalAccountKey } from "../src/features/auth/local-account";

describe("local account identity", () => {
  it("uses the verified normalized email across backend environments", () => {
    expect(normalizeLocalAccountKey(" Owner@Example.COM ")).toBe("owner@example.com");
    expect(normalizeLocalAccountKey("owner@example.com")).toBe("owner@example.com");
  });

  it("encodes the account key as a single safe directory segment", () => {
    expect(localAccountDirectorySegment("owner+alpha@example.com")).toBe("owner%2Balpha%40example.com");
    expect(localAccountDirectorySegment("owner@example.com")).not.toContain("/");
  });
});
