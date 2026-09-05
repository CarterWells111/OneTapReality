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

const RUNTIME_CONTRACT_FIELDS = Object.freeze([
  "variant",
  "environmentId",
  "environmentLabel",
  "buildType",
  "buildLabel",
  "apiOrigin",
  "giftUrlOrigin",
  "bundleIdentifier",
  "scheme",
  "releaseAudience",
]);

function checksumRuntimeContract(contract) {
  const serialized = RUNTIME_CONTRACT_FIELDS
    .map((field) => `${String(contract[field]).length}:${String(contract[field])}`)
    .join("|");
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash = Math.imul(hash ^ serialized.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function createBuildEnvironmentContract(variantName, variant = resolveBuildVariant(variantName)) {
  const contract = {
    variant: variantName,
    environmentId: variant.environmentId,
    environmentLabel: variant.environmentLabel,
    buildType: variant.buildType,
    buildLabel: variant.buildLabel,
    apiOrigin: variant.apiOrigin,
    giftUrlOrigin: variant.giftUrlOrigin,
    bundleIdentifier: variant.bundleIdentifier,
    scheme: variant.scheme,
    releaseAudience: variant.releaseAudience,
  };
  return Object.freeze({
    ...contract,
    contractChecksum: checksumRuntimeContract(contract),
  });
}

function resolveBuildVariant(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("APP_VARIANT is required");
  }
  const variant = BUILD_VARIANTS[value.trim()];
  if (!variant) throw new Error(`Unsupported APP_VARIANT: ${value}`);
  return variant;
}

module.exports = {
  BUILD_VARIANTS,
  createBuildEnvironmentContract,
  resolveBuildVariant,
};
