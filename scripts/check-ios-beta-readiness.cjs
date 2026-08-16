const fs = require("node:fs");
const path = require("node:path");

const STAGING_API_ORIGIN = "https://api-staging.onetapreality.com";
const STAGING_ASSOCIATED_DOMAIN = "applinks:staging.onetapreality.com";
const IOS_BUNDLE_IDENTIFIER = "com.onereality.onetapreality";
const SERVER_SECRET_NAMES = new Set([
  "DATABASE_URL",
  "DEVICE_TOKEN_PEPPER",
  "GIFT_TOKEN_PEPPER",
  "GIFT_AUTH_PEPPER",
  "GIFT_CARD_CLEANUP_SECRET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "RESEND_API_KEY",
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

function checkIosBetaReadiness({ eas, app }) {
  const errors = [];
  const alpha = eas?.build?.alpha;
  const expo = app?.expo;
  const ios = expo?.ios;
  const alphaEnv = alpha?.env ?? {};
  const nfcPlugin = findPlugin(expo?.plugins, "react-native-nfc-manager");

  if (eas?.cli?.appVersionSource !== "remote") {
    errors.push("EAS cli.appVersionSource must be remote");
  }
  if (!alpha) {
    errors.push("EAS alpha build profile must exist");
  } else if (alpha.distribution !== "internal") {
    errors.push("alpha distribution must be internal");
  }
  if (alphaEnv.EXPO_PUBLIC_API_ORIGIN !== STAGING_API_ORIGIN) {
    errors.push(`alpha API origin must be ${STAGING_API_ORIGIN}`);
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

  return {
    platform: "ios",
    profile: "alpha",
    apiOrigin: STAGING_API_ORIGIN,
    bundleIdentifier: IOS_BUNDLE_IDENTIFIER,
    associatedDomain: STAGING_ASSOCIATED_DOMAIN,
    nfcEntitlement: "TAG-only",
  };
}

function loadProjectConfig(root = process.cwd()) {
  return {
    eas: JSON.parse(fs.readFileSync(path.join(root, "eas.json"), "utf8")),
    app: JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8")),
  };
}

module.exports = { checkIosBetaReadiness, loadProjectConfig };

if (require.main === module) {
  try {
    const summary = checkIosBetaReadiness(loadProjectConfig());
    console.log(JSON.stringify({ ok: true, ...summary }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
