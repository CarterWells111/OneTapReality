const { resolveBuildVariant } = require("../scripts/build-variants.cjs");

describe("validated iOS build variants", () => {
  it("keeps the staging TestFlight Beta on the existing identity", () => {
    expect(resolveBuildVariant("staging-testflight")).toEqual(expect.objectContaining({
      appName: "OneTapReality",
      bundleIdentifier: "com.onereality.onetapreality",
      scheme: "onetapreality",
      environmentId: "staging",
      apiOrigin: "https://api-staging.onetapreality.com",
      giftUrlOrigin: "https://staging.onetapreality.com",
      releaseAudience: "internal",
      associatedDomains: ["applinks:staging.onetapreality.com"],
    }));
  });

  it("creates a separately installable staging Development Build", () => {
    expect(resolveBuildVariant("development-staging")).toEqual(expect.objectContaining({
      appName: "OneTapReality Dev",
      bundleIdentifier: "com.onereality.onetapreality.dev",
      scheme: "onetapreality-dev",
      environmentId: "staging",
      buildType: "development",
      apiOrigin: "https://api-staging.onetapreality.com",
      giftUrlOrigin: "https://staging.onetapreality.com",
      releaseAudience: "internal",
      associatedDomains: [],
    }));
  });

  it("keeps production free of staging and development identity", () => {
    const production = resolveBuildVariant("production");
    expect(JSON.stringify(production)).not.toContain("staging");
    expect(JSON.stringify(production)).not.toContain("onetapreality.dev");
    expect(production).toEqual(expect.objectContaining({
      bundleIdentifier: "com.onereality.onetapreality",
      environmentId: "production",
      apiOrigin: "https://api.onetapreality.com",
      giftUrlOrigin: "https://onetapreality.com",
      releaseAudience: "public",
    }));
  });

  it("rejects missing and unknown variants", () => {
    expect(() => resolveBuildVariant(undefined)).toThrow("APP_VARIANT is required");
    expect(() => resolveBuildVariant("preview-ish")).toThrow("Unsupported APP_VARIANT");
  });
});
