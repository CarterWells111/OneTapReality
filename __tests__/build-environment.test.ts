import { parseBuildEnvironment } from "../src/config/build-environment";

const developmentEnvironment = {
  variant: "development-staging",
  environmentId: "staging",
  environmentLabel: "STAGING",
  buildType: "development",
  buildLabel: "DEVELOPMENT · STAGING",
  apiOrigin: "https://api-staging.onetapreality.com",
  giftUrlOrigin: "https://staging.onetapreality.com",
  bundleIdentifier: "com.onereality.onetapreality.dev",
  scheme: "onetapreality-dev",
  releaseAudience: "internal",
};

describe("runtime build environment", () => {
  it("accepts the validated Development/Staging contract", () => {
    expect(parseBuildEnvironment(developmentEnvironment)).toEqual(
      expect.objectContaining({
        environmentId: "staging",
        buildType: "development",
        bundleIdentifier: "com.onereality.onetapreality.dev",
      }),
    );
  });

  it("rejects missing metadata and cross-environment field pairs", () => {
    expect(() => parseBuildEnvironment(undefined)).toThrow("buildEnvironment");
    expect(() => parseBuildEnvironment({
      ...developmentEnvironment,
      environmentId: "production",
    })).toThrow("does not match environmentId");
    expect(() => parseBuildEnvironment({
      ...developmentEnvironment,
      bundleIdentifier: "com.onereality.onetapreality",
    })).toThrow("development identity");
  });

  it("does not infer an environment from a domain-like unknown object", () => {
    expect(() => parseBuildEnvironment({
      apiOrigin: "https://api-staging.onetapreality.com",
      giftUrlOrigin: "https://staging.onetapreality.com",
    })).toThrow("buildEnvironment");
  });

  it("keeps staging origins and the Development bundle id out of shared runtime code", () => {
    const { readFileSync } = require("node:fs");
    const { join } = require("node:path");
    const source = readFileSync(
      join(process.cwd(), "src/config/build-environment.ts"),
      "utf8",
    );
    expect(source).not.toContain("api-staging.onetapreality.com");
    expect(source).not.toContain("staging.onetapreality.com");
    expect(source).not.toContain("com.onereality.onetapreality.dev");
  });
});
