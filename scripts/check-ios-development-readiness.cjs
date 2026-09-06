const fs = require("node:fs");
const path = require("node:path");
const { resolveBuildVariant } = require("./build-variants.cjs");
const { SERVER_SECRET_NAMES } = require("./check-ios-beta-readiness.cjs");

const PROFILE = "development";
const VARIANT = "development-staging";

function checkIosDevelopmentReadiness({ eas, app }) {
  const errors = [];
  const profile = eas?.build?.[PROFILE];
  const profileEnv = profile?.env ?? {};
  let variant = null;
  try {
    variant = resolveBuildVariant(profileEnv.APP_VARIANT);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  if (profileEnv.APP_VARIANT !== VARIANT) {
    errors.push(`development must use APP_VARIANT ${VARIANT}`);
  }
  for (const key of Object.keys(profileEnv)) {
    if (key !== "APP_VARIANT") errors.push(`development env contains forbidden key ${key}`);
    if (SERVER_SECRET_NAMES.has(key)) {
      errors.push(`EAS build env must not contain server-only secret ${key}`);
    }
  }
  if (profile?.developmentClient !== true) errors.push("developmentClient must be true");
  if (profile?.distribution !== "internal") errors.push("development distribution must be internal");

  const expo = app?.expo;
  const runtime = expo?.extra?.buildEnvironment;
  if (variant) {
    if (variant.environmentId !== "staging") errors.push("Development Build must use staging");
    if (variant.apiOrigin !== "https://api-staging.onetapreality.com") {
      errors.push("Development Build API origin must be staging");
    }
    if (variant.giftUrlOrigin !== "https://staging.onetapreality.com") {
      errors.push("Development Build gift origin must be staging");
    }
    if (expo?.ios?.bundleIdentifier !== variant.bundleIdentifier) {
      errors.push(`Development bundleIdentifier must be ${variant.bundleIdentifier}`);
    }
    if (expo?.scheme !== variant.scheme) errors.push(`Development scheme must be ${variant.scheme}`);
    if (JSON.stringify(expo?.ios?.associatedDomains) !== "[]") {
      errors.push("Development associatedDomains must be empty so Beta owns staging Universal Links");
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

  if (errors.length > 0) throw new Error(errors.join("\n"));
  return {
    platform: "ios",
    profile: PROFILE,
    variant: VARIANT,
    apiOrigin: variant.apiOrigin,
    giftUrlOrigin: variant.giftUrlOrigin,
    bundleIdentifier: variant.bundleIdentifier,
    scheme: variant.scheme,
    associatedDomains: [...variant.associatedDomains],
    developmentClient: true,
    distribution: "internal",
  };
}

function loadDevelopmentProjectConfig(root = process.cwd()) {
  const eas = JSON.parse(fs.readFileSync(path.join(root, "eas.json"), "utf8"));
  const rawApp = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
  const { resolveAppConfig } = require(path.join(root, "app.config.ts"));
  return {
    eas,
    app: {
      expo: resolveAppConfig(rawApp.expo, eas?.build?.[PROFILE]?.env?.APP_VARIANT),
    },
  };
}

module.exports = { checkIosDevelopmentReadiness, loadDevelopmentProjectConfig };

if (require.main === module) {
  try {
    console.log(JSON.stringify({
      ok: true,
      ...checkIosDevelopmentReadiness(loadDevelopmentProjectConfig()),
    }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
