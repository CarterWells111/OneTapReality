import {
  accountLocalLibraryOwner,
  localAccountDirectorySegment,
  normalizeLegacyLocalLibraryOwner,
  normalizeLocalAccountKey,
} from "../src/features/auth/local-account";

describe("local account identity", () => {
  it("uses the verified normalized email across backend environments", () => {
    expect(normalizeLocalAccountKey(" Owner@Example.COM ")).toBe("owner@example.com");
    expect(normalizeLocalAccountKey("owner@example.com")).toBe("owner@example.com");
  });

  it("encodes the account key as a single safe directory segment", () => {
    expect(localAccountDirectorySegment("owner+alpha@example.com")).toBe("owner%2Balpha%40example.com");
    expect(localAccountDirectorySegment("account:owner+alpha@example.com")).toBe("owner%2Balpha%40example.com");
    expect(localAccountDirectorySegment("guest")).toBe("guest");
    expect(localAccountDirectorySegment("owner@example.com")).not.toContain("/");
  });

  it("uses explicit guest and normalized account owners", () => {
    expect(accountLocalLibraryOwner(" Owner@Example.COM ")).toBe("account:owner@example.com");
    expect(normalizeLegacyLocalLibraryOwner("owner@example.com")).toBe("account:owner@example.com");
    expect(normalizeLegacyLocalLibraryOwner(" account:Owner@Example.COM ")).toBe("account:owner@example.com");
    expect(normalizeLegacyLocalLibraryOwner(null)).toBe("guest");
    expect(normalizeLegacyLocalLibraryOwner(" ")).toBe("guest");
    expect(normalizeLegacyLocalLibraryOwner("internal-role" as string)).toBe("guest");
  });
});
