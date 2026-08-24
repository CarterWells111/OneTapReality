const { checkIosBetaReadiness } = require("../scripts/check-ios-beta-readiness.cjs") as {
  checkIosBetaReadiness: (input: { eas: unknown; app: unknown; pkg?: unknown }, options?: { profile?: string }) => {
    platform: string;
    profile: string;
    apiOrigin: string;
    giftOrigin: string;
    bundleIdentifier: string;
    associatedDomain: string;
    nfcEntitlement: string;
  };
};

function validConfig() {
  return {
    pkg: { version: "1.1.2" },
    eas: {
      cli: { appVersionSource: "remote", requireCommit: true },
      build: {
        alpha: {
          distribution: "internal",
          env: {
            EXPO_PUBLIC_API_ORIGIN: "https://api-staging.onetapreality.com",
            EXPO_PUBLIC_GIFT_ORIGIN: "https://staging.onetapreality.com",
          },
        },
        "beta-external": {
          distribution: "store",
          environment: "preview",
          autoIncrement: true,
          env: {
            EXPO_PUBLIC_API_ORIGIN: "https://api-staging.onetapreality.com",
            EXPO_PUBLIC_GIFT_ORIGIN: "https://staging.onetapreality.com",
            EXPO_PUBLIC_RELEASE_AUDIENCE: "external-beta",
          },
        },
      },
      submit: {
        "beta-external": { ios: { ascAppId: "6794186067" } },
      },
    },
    app: {
      expo: {
        locales: {
          en: "./locales/en.json",
          "zh-Hans": "./locales/zh-Hans.json",
        },
        scheme: "onetapreality",
        version: "1.1.2",
        ios: {
          bundleIdentifier: "com.onereality.onetapreality",
          associatedDomains: [
            "applinks:onetapreality.com",
            "applinks:staging.onetapreality.com",
          ],
          infoPlist: { ITSAppUsesNonExemptEncryption: false, MinimumOSVersion: "15.1" },
        },
        plugins: [
          [
            "react-native-nfc-manager",
            {
              nfcPermission: "Scan a OneTapReality gift card to open its invitation link.",
              includeNdefEntitlement: false,
            },
          ],
        ],
      },
    },
  };
}

describe("iOS Beta readiness preflight", () => {
  it("accepts the internal alpha profile with staging links and TAG-only NFC", () => {
    expect(checkIosBetaReadiness(validConfig())).toEqual({
      platform: "ios",
      profile: "alpha",
      apiOrigin: "https://api-staging.onetapreality.com",
      giftOrigin: "https://staging.onetapreality.com",
      bundleIdentifier: "com.onereality.onetapreality",
      associatedDomain: "applinks:staging.onetapreality.com",
      nfcEntitlement: "TAG-only",
    });
  });

  it("rejects a profile that points to production", () => {
    const input = validConfig();
    input.eas.build.alpha.env.EXPO_PUBLIC_API_ORIGIN = "https://api.onetapreality.com";

    expect(() => checkIosBetaReadiness(input)).toThrow(
      "alpha API origin must be https://api-staging.onetapreality.com",
    );
  });

  it("rejects a missing staging associated domain", () => {
    const input = validConfig();
    input.app.expo.ios.associatedDomains = ["applinks:onetapreality.com"];

    expect(() => checkIosBetaReadiness(input)).toThrow(
      "iOS associatedDomains must include applinks:staging.onetapreality.com",
    );
  });

  it("rejects a missing native NFC plugin", () => {
    const input = validConfig();
    input.app.expo.plugins = [];

    expect(() => checkIosBetaReadiness(input)).toThrow(
      "react-native-nfc-manager must be configured",
    );
  });

  it("rejects a different iOS bundle identifier", () => {
    const input = validConfig();
    input.app.expo.ios.bundleIdentifier = "com.example.wrong";

    expect(() => checkIosBetaReadiness(input)).toThrow(
      "iOS bundleIdentifier must be com.onereality.onetapreality",
    );
  });

  it("rejects server-only secrets in EAS build env", () => {
    const input = validConfig();
    Object.assign(input.eas.build.alpha.env, { GIFT_TOKEN_PEPPER: "must-not-ship" });

    expect(() => checkIosBetaReadiness(input)).toThrow(
      "EAS build env must not contain server-only secret GIFT_TOKEN_PEPPER",
    );
  });

  it("rejects an alpha profile with a mismatched gift origin", () => {
    const input = validConfig();
    input.eas.build.alpha.env.EXPO_PUBLIC_GIFT_ORIGIN = "https://onetapreality.com";

    expect(() => checkIosBetaReadiness(input)).toThrow(
      "alpha gift origin must be https://staging.onetapreality.com",
    );
  });

  it("accepts the external Beta profile only with its exact release contract", () => {
    expect(checkIosBetaReadiness(validConfig(), { profile: "beta-external" })).toEqual({
      platform: "ios",
      profile: "beta-external",
      apiOrigin: "https://api-staging.onetapreality.com",
      giftOrigin: "https://staging.onetapreality.com",
      releaseAudience: "external-beta",
      version: "1.1.2",
      bundleIdentifier: "com.onereality.onetapreality",
      associatedDomain: "applinks:staging.onetapreality.com",
      nfcEntitlement: "TAG-only",
    });
  });

  it("rejects a writable NFC purpose string or an iOS target other than 15.1", () => {
    const input = validConfig();
    input.app.expo.ios.infoPlist.MinimumOSVersion = "16.0";
    (input.app.expo.plugins[0][1] as { nfcPermission: string }).nfcPermission = "Read and write NFC cards";

    expect(() => checkIosBetaReadiness(input, { profile: "beta-external" })).toThrow(/15\.1/u);
    expect(() => checkIosBetaReadiness(input, { profile: "beta-external" })).toThrow(/read-only/u);
  });

  it.each([
    ["distribution", (input: ReturnType<typeof validConfig>) => { input.eas.build["beta-external"].distribution = "internal"; }],
    ["environment", (input: ReturnType<typeof validConfig>) => { input.eas.build["beta-external"].environment = "production"; }],
    ["API origin", (input: ReturnType<typeof validConfig>) => { input.eas.build["beta-external"].env.EXPO_PUBLIC_API_ORIGIN = "https://api.onetapreality.com"; }],
    ["gift origin", (input: ReturnType<typeof validConfig>) => { input.eas.build["beta-external"].env.EXPO_PUBLIC_GIFT_ORIGIN = "https://onetapreality.com"; }],
    ["release audience", (input: ReturnType<typeof validConfig>) => { input.eas.build["beta-external"].env.EXPO_PUBLIC_RELEASE_AUDIENCE = "internal"; }],
  ])("rejects an external profile with the wrong %s", (_label, mutate) => {
    const input = validConfig();
    mutate(input);

    expect(() => checkIosBetaReadiness(input, { profile: "beta-external" })).toThrow();
  });

  it("rejects external Beta version drift, submit groups, secrets and encryption drift", () => {
    const input = validConfig();
    input.app.expo.version = "1.1.1";
    input.pkg.version = "1.1.1";
    Object.assign(input.eas.submit["beta-external"].ios, { groups: ["wrong"] });
    Object.assign(input.eas.build["beta-external"].env, { RESEND_API_KEY: "must-not-ship" });
    input.app.expo.ios.infoPlist.ITSAppUsesNonExemptEncryption = true;

    expect(() => checkIosBetaReadiness(input, { profile: "beta-external" })).toThrow(
      /1\.1\.2/,
    );
    expect(() => checkIosBetaReadiness(input, { profile: "beta-external" })).toThrow(
      /must not define groups/,
    );
    expect(() => checkIosBetaReadiness(input, { profile: "beta-external" })).toThrow(
      /RESEND_API_KEY/,
    );
    expect(() => checkIosBetaReadiness(input, { profile: "beta-external" })).toThrow(
      /ITSAppUsesNonExemptEncryption/,
    );
  });
});
