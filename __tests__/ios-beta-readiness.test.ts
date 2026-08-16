const { checkIosBetaReadiness } = require("../scripts/check-ios-beta-readiness.cjs") as {
  checkIosBetaReadiness: (input: { eas: unknown; app: unknown }) => {
    platform: string;
    profile: string;
    apiOrigin: string;
    bundleIdentifier: string;
    associatedDomain: string;
    nfcEntitlement: string;
  };
};

function validConfig() {
  return {
    eas: {
      cli: { appVersionSource: "remote" },
      build: {
        alpha: {
          distribution: "internal",
          env: { EXPO_PUBLIC_API_ORIGIN: "https://api-staging.onetapreality.com" },
        },
      },
    },
    app: {
      expo: {
        scheme: "onetapreality",
        ios: {
          bundleIdentifier: "com.onereality.onetapreality",
          associatedDomains: [
            "applinks:onetapreality.com",
            "applinks:staging.onetapreality.com",
          ],
        },
        plugins: [
          [
            "react-native-nfc-manager",
            {
              nfcPermission: "Allow OneTapReality to read and write NFC gift cards.",
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
});
