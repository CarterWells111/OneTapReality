const { resolveAppConfig } = require("../app.config");
const {
  checkIosBetaReadiness,
  loadProjectConfig,
  parseProfileArgs,
} = require("../scripts/check-ios-beta-readiness.cjs");

function validConfig(profile = "staging-testflight") {
  const variantByProfile: Record<string, string> = {
    alpha: "alpha-staging",
    "staging-testflight": "staging-testflight",
    "beta-external": "external-beta-staging",
  };
  const variant = variantByProfile[profile];
  const baseExpo = require("../app.json").expo;
  return {
    pkg: { version: "1.1.2" },
    productionServiceEnv: { APPLE_REVIEW_ACCESS_ENABLED: "false" },
    eas: {
      cli: { appVersionSource: "remote", requireCommit: true },
      build: {
        [profile]: {
          distribution: profile === "alpha" ? "internal" : "store",
          ...(profile === "alpha" ? {} : { environment: "preview", autoIncrement: true }),
          env: { APP_VARIANT: variant },
        },
      },
      submit: {
        [profile]: {
          ios: {
            ascAppId: "6794186067",
            ...(profile === "staging-testflight" ? { groups: ["OneTapReality开发员测试"] } : {}),
          },
        },
      },
    },
    app: { expo: resolveAppConfig(baseExpo, variant) },
  };
}

describe("iOS Beta readiness preflight", () => {
  it("accepts the in-place staging TestFlight recovery build", () => {
    expect(checkIosBetaReadiness(validConfig(), { profile: "staging-testflight" }))
      .toEqual(expect.objectContaining({
        platform: "ios",
        profile: "staging-testflight",
        variant: "staging-testflight",
        apiOrigin: "https://api-staging.onetapreality.com",
        giftUrlOrigin: "https://staging.onetapreality.com",
        releaseAudience: "internal",
        bundleIdentifier: "com.onereality.onetapreality",
        associatedDomains: ["applinks:staging.onetapreality.com"],
        activationEntry: "activate-entry.internal.tsx",
        nfcEntitlement: "TAG-only",
      }));
  });

  it("retains external Beta placeholder isolation on the same staging backend", () => {
    expect(checkIosBetaReadiness(validConfig("beta-external"), { profile: "beta-external" }))
      .toEqual(expect.objectContaining({
        variant: "external-beta-staging",
        releaseAudience: "external-beta",
        activationEntry: "activate-entry.tsx",
        version: "1.1.2",
      }));
  });

  it("accepts the existing alpha staging profile", () => {
    expect(checkIosBetaReadiness(validConfig("alpha"), { profile: "alpha" }))
      .toEqual(expect.objectContaining({ variant: "alpha-staging", releaseAudience: "internal" }));
  });

  it("rejects production variants, identity drift, link drift, and server secrets", () => {
    const wrongVariant = validConfig();
    wrongVariant.eas.build["staging-testflight"].env.APP_VARIANT = "production";
    expect(() => checkIosBetaReadiness(wrongVariant, { profile: "staging-testflight" }))
      .toThrow(/staging/u);

    const wrongIdentity = validConfig();
    wrongIdentity.app.expo.ios.bundleIdentifier = "com.example.wrong";
    expect(() => checkIosBetaReadiness(wrongIdentity, { profile: "staging-testflight" }))
      .toThrow(/bundleIdentifier/u);

    const wrongLinks = validConfig();
    wrongLinks.app.expo.ios.associatedDomains = ["applinks:onetapreality.com"];
    expect(() => checkIosBetaReadiness(wrongLinks, { profile: "staging-testflight" }))
      .toThrow(/associatedDomains/u);

    const secret = validConfig();
    Object.assign(secret.eas.build["staging-testflight"].env, {
      GIFT_TOKEN_PEPPER: "must-not-ship",
    });
    expect(() => checkIosBetaReadiness(secret, { profile: "staging-testflight" }))
      .toThrow(/GIFT_TOKEN_PEPPER/u);
  });

  it("rejects writable NFC purpose text and missing build metadata", () => {
    const input = validConfig();
    input.app.expo.plugins = input.app.expo.plugins.map((plugin: unknown) => (
      Array.isArray(plugin) && plugin[0] === "react-native-nfc-manager"
        ? [plugin[0], { ...plugin[1], nfcPermission: "Read and write NFC cards" }]
        : plugin
    ));
    expect(() => checkIosBetaReadiness(input, { profile: "staging-testflight" }))
      .toThrow(/read-only/u);

    const missing = validConfig();
    delete missing.app.expo.extra.buildEnvironment;
    expect(() => checkIosBetaReadiness(missing, { profile: "staging-testflight" }))
      .toThrow(/buildEnvironment/u);
  });

  it("loads and resolves the selected repository profile through app.config", () => {
    const loaded = loadProjectConfig(process.cwd(), { profile: "staging-testflight" });
    expect(loaded.app.expo).toEqual(expect.objectContaining({
      scheme: "onetapreality",
      ios: expect.objectContaining({
        bundleIdentifier: "com.onereality.onetapreality",
        associatedDomains: ["applinks:staging.onetapreality.com"],
      }),
      extra: expect.objectContaining({
        buildEnvironment: expect.objectContaining({
          apiOrigin: "https://api-staging.onetapreality.com",
        }),
      }),
    }));
    expect(parseProfileArgs([])).toEqual({ profile: "beta-external" });
    expect(() => parseProfileArgs(["--profile", "beta-external", "--profile", "alpha"]))
      .toThrow("--profile may only be provided once");
  });
});
