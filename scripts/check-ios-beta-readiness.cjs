const fs = require("node:fs");
const path = require("node:path");

const STAGING_API_ORIGIN = "https://api-staging.onetapreality.com";
const STAGING_GIFT_ORIGIN = "https://staging.onetapreality.com";
const STAGING_ASSOCIATED_DOMAIN = "applinks:staging.onetapreality.com";
const IOS_BUNDLE_IDENTIFIER = "com.onereality.onetapreality";
const EXTERNAL_BETA_PROFILE = "beta-external";
const EXTERNAL_BETA_VERSION = "1.1.2";
const EXTERNAL_BETA_AUDIENCE = "external-beta";
const IOS_MINIMUM_VERSION = "15.1";
const EXTERNAL_BETA_PUBLIC_ENV = new Set([
  "EXPO_PUBLIC_API_ORIGIN",
  "EXPO_PUBLIC_GIFT_ORIGIN",
  "EXPO_PUBLIC_RELEASE_AUDIENCE",
]);
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

function checkIosBetaReadiness({ eas, app, pkg }, { profile = EXTERNAL_BETA_PROFILE } = {}) {
  const errors = [];
  const selectedProfile = eas?.build?.[profile];
  const expo = app?.expo;
  const ios = expo?.ios;
  const profileEnv = selectedProfile?.env ?? {};
  const nfcPlugin = findPlugin(expo?.plugins, "react-native-nfc-manager");

  if (eas?.cli?.appVersionSource !== "remote") {
    errors.push("EAS cli.appVersionSource must be remote");
  }
  if (!selectedProfile) {
    errors.push(`EAS ${profile} build profile must exist`);
  } else if (profile === "alpha") {
    if (selectedProfile.distribution !== "internal") {
      errors.push("alpha distribution must be internal");
    }
    if (profileEnv.EXPO_PUBLIC_API_ORIGIN !== STAGING_API_ORIGIN) {
      errors.push(`alpha API origin must be ${STAGING_API_ORIGIN}`);
    }
    if (profileEnv.EXPO_PUBLIC_GIFT_ORIGIN !== STAGING_GIFT_ORIGIN) {
      errors.push(`alpha gift origin must be ${STAGING_GIFT_ORIGIN}`);
    }
  } else if (profile === EXTERNAL_BETA_PROFILE) {
    if (selectedProfile.distribution !== "store") {
      errors.push("beta-external distribution must be store");
    }
    if (selectedProfile.environment !== "preview") {
      errors.push("beta-external environment must be preview");
    }
    if (selectedProfile.autoIncrement !== true) {
      errors.push("beta-external autoIncrement must be true");
    }
    if (profileEnv.EXPO_PUBLIC_API_ORIGIN !== STAGING_API_ORIGIN) {
      errors.push(`beta-external API origin must be ${STAGING_API_ORIGIN}`);
    }
    if (profileEnv.EXPO_PUBLIC_GIFT_ORIGIN !== STAGING_GIFT_ORIGIN) {
      errors.push(`beta-external gift origin must be ${STAGING_GIFT_ORIGIN}`);
    }
    if (profileEnv.EXPO_PUBLIC_RELEASE_AUDIENCE !== EXTERNAL_BETA_AUDIENCE) {
      errors.push(`beta-external release audience must be ${EXTERNAL_BETA_AUDIENCE}`);
    }
    for (const key of Object.keys(profileEnv)) {
      if (!EXTERNAL_BETA_PUBLIC_ENV.has(key)) {
        errors.push(`beta-external env contains forbidden key ${key}`);
      }
    }
    if (eas?.cli?.requireCommit !== true) {
      errors.push("EAS cli.requireCommit must be true for beta-external");
    }
    if (expo?.version !== EXTERNAL_BETA_VERSION) {
      errors.push(`Expo version must be ${EXTERNAL_BETA_VERSION} for beta-external`);
    }
    if (pkg?.version !== EXTERNAL_BETA_VERSION) {
      errors.push(`package version must be ${EXTERNAL_BETA_VERSION} for beta-external`);
    }
    const submitIos = eas?.submit?.[EXTERNAL_BETA_PROFILE]?.ios;
    if (!submitIos?.ascAppId) {
      errors.push("EAS beta-external submit.ios.ascAppId must be configured");
    }
    if (Object.prototype.hasOwnProperty.call(submitIos ?? {}, "groups")) {
      errors.push("EAS beta-external submit.ios must not define groups");
    }
  } else {
    errors.push(`Unsupported iOS Beta profile: ${profile}`);
  }

  for (const buildProfile of Object.values(eas?.build ?? {})) {
    for (const key of Object.keys(buildProfile?.env ?? {})) {
      if (SERVER_SECRET_NAMES.has(key)) {
        errors.push(`EAS build env must not contain server-only secret ${key}`);
      }
    }
  }

  if (expo?.scheme !== "onetapreality") {
    errors.push("Expo scheme must be onetapreality");
  }
  if (ios?.bundleIdentifier !== IOS_BUNDLE_IDENTIFIER) {
    errors.push(`iOS bundleIdentifier must be ${IOS_BUNDLE_IDENTIFIER}`);
  }
  if (profile === EXTERNAL_BETA_PROFILE && ios?.infoPlist?.ITSAppUsesNonExemptEncryption !== false) {
    errors.push("iOS ITSAppUsesNonExemptEncryption must be false for beta-external");
  }
  if (ios?.infoPlist?.MinimumOSVersion !== IOS_MINIMUM_VERSION) {
    errors.push(`iOS MinimumOSVersion must remain ${IOS_MINIMUM_VERSION}`);
  }
  if (expo?.locales?.en !== "./locales/en.json" || expo?.locales?.["zh-Hans"] !== "./locales/zh-Hans.json") {
    errors.push("iOS permission descriptions must provide English and zh-Hans localizations");
  }
  if (!Array.isArray(ios?.associatedDomains)
      || ios.associatedDomains.length !== 1
      || ios.associatedDomains[0] !== STAGING_ASSOCIATED_DOMAIN) {
    errors.push(`iOS associatedDomains must equal ${STAGING_ASSOCIATED_DOMAIN}`);
  }
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

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  const summary = {
    platform: "ios",
    profile,
    apiOrigin: STAGING_API_ORIGIN,
    giftOrigin: STAGING_GIFT_ORIGIN,
    bundleIdentifier: IOS_BUNDLE_IDENTIFIER,
    associatedDomain: STAGING_ASSOCIATED_DOMAIN,
    nfcEntitlement: "TAG-only",
  };
  if (profile === EXTERNAL_BETA_PROFILE) {
    return {
      ...summary,
      releaseAudience: EXTERNAL_BETA_AUDIENCE,
      version: EXTERNAL_BETA_VERSION,
    };
  }
  return summary;
}

function loadProjectConfig(root = process.cwd(), { profile = EXTERNAL_BETA_PROFILE } = {}) {
  const eas = JSON.parse(fs.readFileSync(path.join(root, "eas.json"), "utf8"));
  const app = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
  const audience = eas?.build?.[profile]?.env?.EXPO_PUBLIC_RELEASE_AUDIENCE;
  if (audience === "public") {
    app.expo.ios.associatedDomains = ["applinks:onetapreality.com"];
  } else if (audience === "internal" || audience === EXTERNAL_BETA_AUDIENCE) {
    app.expo.ios.associatedDomains = [STAGING_ASSOCIATED_DOMAIN];
  }
  return {
    eas,
    app,
    pkg: JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")),
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

module.exports = { checkIosBetaReadiness, loadProjectConfig, parseProfileArgs };

if (require.main === module) {
  try {
    const options = parseProfileArgs(process.argv.slice(2));
    const summary = checkIosBetaReadiness(
      loadProjectConfig(process.cwd(), options),
      options,
    );
    console.log(JSON.stringify({ ok: true, ...summary }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
