const fs = require("node:fs");
const path = require("node:path");
const { resolveBuildVariant } = require("./build-variants.cjs");

const EXTERNAL_BETA_PROFILE = "beta-external";
const EXTERNAL_BETA_VERSION = "1.1.2";
const IOS_MINIMUM_VERSION = "15.1";
const EXPECTED_VARIANTS = Object.freeze({
  alpha: "alpha-staging",
  "staging-testflight": "staging-testflight",
  "beta-external": "external-beta-staging",
});
const SERVER_SECRET_NAMES = new Set([
  "DATABASE_URL",
  "DEVICE_TOKEN_PEPPER",
  "GIFT_TOKEN_PEPPER",
  "GIFT_AUTH_PEPPER",
  "GIFT_CARD_CLEANUP_SECRET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "RESEND_API_KEY",
  "APPLE_REVIEW_EMAIL",
  "APPLE_REVIEW_CODE",
  "APPLE_REVIEW_ACCESS_ENABLED",
  "APPLE_REVIEW_FIXTURE_SECRET",
  "APPLE_REVIEW_CLAIM_TOKEN",
]);

function findPlugin(plugins, name) {
  if (!Array.isArray(plugins)) return null;
  for (const entry of plugins) {
    if (entry === name) return { name, options: {} };
    if (Array.isArray(entry) && entry[0] === name) {
      return { name, options: entry[1] ?? {} };
    }
  }
  return null;
}

function parseEnvironmentContract(contents) {
  const environment = {};
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    environment[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return environment;
}

function checkIosBetaReadiness(
  { eas, app, pkg, productionServiceEnv },
  { profile = EXTERNAL_BETA_PROFILE } = {},
) {
  const errors = [];
  const expectedVariantName = EXPECTED_VARIANTS[profile];
  if (!expectedVariantName) errors.push(`Unsupported iOS Beta profile: ${profile}`);

  const selectedProfile = eas?.build?.[profile];
  if (!selectedProfile) errors.push(`EAS ${profile} build profile must exist`);
  const profileEnv = selectedProfile?.env ?? {};
  const variantName = profileEnv.APP_VARIANT;
  let variant = null;
  try {
    variant = resolveBuildVariant(variantName);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (expectedVariantName && variantName !== expectedVariantName) {
    errors.push(`${profile} must use APP_VARIANT ${expectedVariantName} for staging`);
  }
  for (const key of Object.keys(profileEnv)) {
    if (key !== "APP_VARIANT") errors.push(`${profile} env contains forbidden key ${key}`);
  }
  for (const buildProfile of Object.values(eas?.build ?? {})) {
    for (const key of Object.keys(buildProfile?.env ?? {})) {
      if (SERVER_SECRET_NAMES.has(key)) {
        errors.push(`EAS build env must not contain server-only secret ${key}`);
      }
    }
  }

  if (eas?.cli?.appVersionSource !== "remote") {
    errors.push("EAS cli.appVersionSource must be remote");
  }
  if (profile === "alpha" && selectedProfile?.distribution !== "internal") {
    errors.push("alpha distribution must be internal");
  }
  if (["staging-testflight", EXTERNAL_BETA_PROFILE].includes(profile)) {
    if (selectedProfile?.distribution !== "store") errors.push(`${profile} distribution must be store`);
    if (selectedProfile?.environment !== "preview") errors.push(`${profile} environment must be preview`);
    if (selectedProfile?.autoIncrement !== true) errors.push(`${profile} autoIncrement must be true`);
  }

  if (productionServiceEnv?.APPLE_REVIEW_ACCESS_ENABLED?.trim().toLowerCase() !== "false") {
    errors.push("Production service APPLE_REVIEW_ACCESS_ENABLED must be explicitly false");
  }

  const expo = app?.expo;
  const ios = expo?.ios;
  const runtime = expo?.extra?.buildEnvironment;
  if (!runtime || typeof runtime !== "object") {
    errors.push("Expo buildEnvironment metadata must be configured");
  }
  if (variant) {
    if (variant.environmentId !== "staging") errors.push(`${profile} environment must be staging`);
    if (expo?.scheme !== variant.scheme) errors.push(`Expo scheme must be ${variant.scheme}`);
    if (ios?.bundleIdentifier !== variant.bundleIdentifier) {
      errors.push(`iOS bundleIdentifier must be ${variant.bundleIdentifier}`);
    }
    if (JSON.stringify(ios?.associatedDomains) !== JSON.stringify(variant.associatedDomains)) {
      errors.push(`iOS associatedDomains must equal ${variant.associatedDomains.join(",")}`);
    }
    for (const key of [
      "environmentId",
      "environmentLabel",
      "buildType",
      "buildLabel",
      "apiOrigin",
      "giftUrlOrigin",
      "bundleIdentifier",
      "scheme",
      "releaseAudience",
    ]) {
      if (runtime?.[key] !== variant[key]) errors.push(`Expo buildEnvironment ${key} must match APP_VARIANT`);
    }
  }

  if (ios?.infoPlist?.MinimumOSVersion !== IOS_MINIMUM_VERSION) {
    errors.push(`iOS MinimumOSVersion must remain ${IOS_MINIMUM_VERSION}`);
  }
  if (expo?.locales?.en !== "./locales/en.json" || expo?.locales?.["zh-Hans"] !== "./locales/zh-Hans.json") {
    errors.push("iOS permission descriptions must provide English and zh-Hans localizations");
  }
  const nfcPlugin = findPlugin(expo?.plugins, "react-native-nfc-manager");
  if (!nfcPlugin) {
    errors.push("react-native-nfc-manager must be configured");
  } else {
    if (nfcPlugin.options.includeNdefEntitlement !== false) {
      errors.push("NFC includeNdefEntitlement must be false for TAG-only iOS entitlement");
    }
    if (typeof nfcPlugin.options.nfcPermission !== "string" || !nfcPlugin.options.nfcPermission.trim()) {
      errors.push("NFC permission text must be configured");
    } else if (/\bwrite\b|写入|写卡/iu.test(nfcPlugin.options.nfcPermission)) {
      errors.push("NFC permission text must describe read-only scanning");
    }
  }

  if (profile === EXTERNAL_BETA_PROFILE) {
    if (eas?.cli?.requireCommit !== true) errors.push("EAS cli.requireCommit must be true for beta-external");
    if (expo?.version !== EXTERNAL_BETA_VERSION || pkg?.version !== EXTERNAL_BETA_VERSION) {
      errors.push(`Expo and package version must be ${EXTERNAL_BETA_VERSION} for beta-external`);
    }
    if (ios?.infoPlist?.ITSAppUsesNonExemptEncryption !== false) {
      errors.push("iOS ITSAppUsesNonExemptEncryption must be false for beta-external");
    }
    const submitIos = eas?.submit?.[EXTERNAL_BETA_PROFILE]?.ios;
    if (!submitIos?.ascAppId) errors.push("EAS beta-external submit.ios.ascAppId must be configured");
    if (Object.prototype.hasOwnProperty.call(submitIos ?? {}, "groups")) {
      errors.push("EAS beta-external submit.ios must not define groups");
    }
  }
  if (profile === "staging-testflight") {
    const groups = eas?.submit?.[profile]?.ios?.groups;
    if (!Array.isArray(groups) || groups.length !== 1 || groups[0] !== "OneTapReality开发员测试") {
      errors.push("staging-testflight must target only OneTapReality开发员测试");
    }
  }

  if (errors.length > 0) throw new Error(errors.join("\n"));
  return {
    platform: "ios",
    profile,
    variant: variantName,
    apiOrigin: variant.apiOrigin,
    giftUrlOrigin: variant.giftUrlOrigin,
    releaseAudience: variant.releaseAudience,
    bundleIdentifier: variant.bundleIdentifier,
    associatedDomains: [...variant.associatedDomains],
    activationEntry: variant.releaseAudience === "internal"
      ? "activate-entry.internal.tsx"
      : "activate-entry.tsx",
    nfcEntitlement: "TAG-only",
    ...(profile === EXTERNAL_BETA_PROFILE ? { version: EXTERNAL_BETA_VERSION } : {}),
  };
}

function loadProjectConfig(root = process.cwd(), { profile = EXTERNAL_BETA_PROFILE } = {}) {
  const eas = JSON.parse(fs.readFileSync(path.join(root, "eas.json"), "utf8"));
  const rawApp = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
  const variantName = eas?.build?.[profile]?.env?.APP_VARIANT;
  const { resolveAppConfig } = require(path.join(root, "app.config.ts"));
  return {
    eas,
    app: { expo: resolveAppConfig(rawApp.expo, variantName) },
    pkg: JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")),
    productionServiceEnv: parseEnvironmentContract(
      fs.readFileSync(path.join(root, ".env.example"), "utf8"),
    ),
  };
}

function parseProfileArgs(argv) {
  let profile = EXTERNAL_BETA_PROFILE;
  let profileWasExplicit = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--profile=")) {
      if (profileWasExplicit) throw new Error("--profile may only be provided once");
      profile = arg.slice("--profile=".length);
      profileWasExplicit = true;
    } else if (arg === "--profile") {
      if (profileWasExplicit) throw new Error("--profile may only be provided once");
      profile = argv[index + 1];
      profileWasExplicit = true;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
    if (!profile) throw new Error("--profile requires a value");
  }
  return { profile };
}

module.exports = {
  checkIosBetaReadiness,
  loadProjectConfig,
  parseEnvironmentContract,
  parseProfileArgs,
  SERVER_SECRET_NAMES,
};

if (require.main === module) {
  try {
    const options = parseProfileArgs(process.argv.slice(2));
    const summary = checkIosBetaReadiness(loadProjectConfig(process.cwd(), options), options);
    console.log(JSON.stringify({ ok: true, ...summary }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
