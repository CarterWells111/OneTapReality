const BUILD_VARIANTS = Object.freeze({
  "development-staging": Object.freeze({
    appName: "OneTapReality Dev",
    bundleIdentifier: "com.onereality.onetapreality.dev",
    scheme: "onetapreality-dev",
    environmentId: "staging",
    environmentLabel: "STAGING",
    buildType: "development",
    buildLabel: "DEVELOPMENT · STAGING",
    apiOrigin: "https://api-staging.onetapreality.com",
    giftUrlOrigin: "https://staging.onetapreality.com",
    releaseAudience: "internal",
    associatedDomains: Object.freeze([]),
  }),
  "staging-testflight": Object.freeze({
    appName: "OneTapReality",
    bundleIdentifier: "com.onereality.onetapreality",
    scheme: "onetapreality",
    environmentId: "staging",
    environmentLabel: "STAGING",
    buildType: "testflight",
    buildLabel: "BETA · STAGING",
    apiOrigin: "https://api-staging.onetapreality.com",
    giftUrlOrigin: "https://staging.onetapreality.com",
    releaseAudience: "internal",
    associatedDomains: Object.freeze(["applinks:staging.onetapreality.com"]),
  }),
  "alpha-staging": Object.freeze({
    appName: "OneTapReality",
    bundleIdentifier: "com.onereality.onetapreality",
    scheme: "onetapreality",
    environmentId: "staging",
    environmentLabel: "STAGING",
    buildType: "internal",
    buildLabel: "ALPHA · STAGING",
    apiOrigin: "https://api-staging.onetapreality.com",
    giftUrlOrigin: "https://staging.onetapreality.com",
    releaseAudience: "internal",
    associatedDomains: Object.freeze(["applinks:staging.onetapreality.com"]),
  }),
  "external-beta-staging": Object.freeze({
    appName: "OneTapReality",
    bundleIdentifier: "com.onereality.onetapreality",
    scheme: "onetapreality",
    environmentId: "staging",
    environmentLabel: "STAGING",
    buildType: "external-beta",
    buildLabel: "BETA · STAGING",
    apiOrigin: "https://api-staging.onetapreality.com",
    giftUrlOrigin: "https://staging.onetapreality.com",
    releaseAudience: "external-beta",
    associatedDomains: Object.freeze(["applinks:staging.onetapreality.com"]),
  }),
  production: Object.freeze({
    appName: "OneTapReality",
    bundleIdentifier: "com.onereality.onetapreality",
    scheme: "onetapreality",
    environmentId: "production",
    environmentLabel: "PRODUCTION",
    buildType: "production",
    buildLabel: "PRODUCTION",
    apiOrigin: "https://api.onetapreality.com",
    giftUrlOrigin: "https://onetapreality.com",
    releaseAudience: "public",
    associatedDomains: Object.freeze(["applinks:onetapreality.com"]),
  }),
});

function resolveBuildVariant(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("APP_VARIANT is required");
  }
  const variant = BUILD_VARIANTS[value.trim()];
  if (!variant) throw new Error(`Unsupported APP_VARIANT: ${value}`);
  return variant;
}

module.exports = { BUILD_VARIANTS, resolveBuildVariant };
