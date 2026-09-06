const {
  checkIosDevelopmentReadiness,
  loadDevelopmentProjectConfig,
} = require("../scripts/check-ios-development-readiness.cjs");

function validDevelopmentInput() {
  return loadDevelopmentProjectConfig(process.cwd());
}

describe("iOS Development Build readiness", () => {
  it("accepts only the independent staging Development identity", () => {
    expect(checkIosDevelopmentReadiness(validDevelopmentInput())).toEqual({
      platform: "ios",
      profile: "development",
      variant: "development-staging",
      apiOrigin: "https://api-staging.onetapreality.com",
      giftUrlOrigin: "https://staging.onetapreality.com",
      bundleIdentifier: "com.onereality.onetapreality.dev",
      scheme: "onetapreality-dev",
      associatedDomains: [],
      developmentClient: true,
      distribution: "internal",
    });
  });

  it.each([
    ["production variant", (input: any) => { input.eas.build.development.env.APP_VARIANT = "production"; }],
    ["Beta bundle", (input: any) => { input.app.expo.ios.bundleIdentifier = "com.onereality.onetapreality"; }],
    ["Beta scheme", (input: any) => { input.app.expo.scheme = "onetapreality"; }],
    ["shared Universal Link", (input: any) => { input.app.expo.ios.associatedDomains = ["applinks:staging.onetapreality.com"]; }],
    ["no development client", (input: any) => { input.eas.build.development.developmentClient = false; }],
    ["server secret", (input: any) => { input.eas.build.development.env.DATABASE_URL = "secret"; }],
  ])("rejects %s drift", (_label, mutate) => {
    const input = validDevelopmentInput();
    mutate(input);
    expect(() => checkIosDevelopmentReadiness(input)).toThrow();
  });
});
