const fs = require("node:fs");
const path = require("node:path");

const STAGING_API_ORIGIN = "https://api-staging.onetapreality.com";
const STAGING_ASSOCIATED_DOMAIN = "applinks:staging.onetapreality.com";
const IOS_BUNDLE_IDENTIFIER = "com.onereality.onetapreality";
const EXTERNAL_BETA_PROFILE = "beta-external";
const EXTERNAL_BETA_VERSION = "1.1.2";
const EXTERNAL_BETA_AUDIENCE = "external-beta";
const EXTERNAL_BETA_PUBLIC_ENV = new Set([
  "EXPO_PUBLIC_API_ORIGIN",
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

function checkIosBetaReadiness({ eas, app, pkg }, { profile = "alpha" } = {}) {
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
  if (!Array.isArray(ios?.associatedDomains) || !ios.associatedDomains.includes(STAGING_ASSOCIATED_DOMAIN)) {
    errors.push(`iOS associatedDomains must include ${STAGING_ASSOCIATED_DOMAIN}`);
  }
  if (!nfcPlugin) {
    errors.push("react-native-nfc-manager must be configured");
  } else {
    if (nfcPlugin.options.includeNdefEntitlement !== false) {
      errors.push("NFC includeNdefEntitlement must be false for TAG-only iOS entitlement");
    }
    if (typeof nfcPlugin.options.nfcPermission !== "string" || !nfcPlugin.options.nfcPermission.trim()) {
      errors.push("NFC permission text must be configured");
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  const summary = {
    platform: "ios",
    profile,
    apiOrigin: STAGING_API_ORIGIN,
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

function loadProjectConfig(root = process.cwd()) {
  return {
    eas: JSON.parse(fs.readFileSync(path.join(root, "eas.json"), "utf8")),
    app: JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8")),
    pkg: JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")),
  };
}

function parseProfileArgs(argv) {
  let profile = "alpha";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--profile=")) {
      profile = arg.slice("--profile=".length);
    } else if (arg === "--profile") {
      profile = argv[index + 1];
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
    const summary = checkIosBetaReadiness(
      loadProjectConfig(),
      parseProfileArgs(process.argv.slice(2)),
    );
    console.log(JSON.stringify({ ok: true, ...summary }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
