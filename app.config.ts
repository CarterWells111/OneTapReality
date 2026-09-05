// @ts-nocheck
// EAS CLI loads this .ts file as CommonJS during project initialization.
// Keep it valid JavaScript so both EAS and Expo CLI can evaluate it.
const { resolveBuildVariant } = require("./scripts/build-variants.cjs");

function normalizeOrigin(origin) {
  return origin.replace(/\/+$/u, "");
}

function withRouterOrigin(config, origin) {
  if (!origin) return config;

  const normalizedOrigin = normalizeOrigin(origin);
  return {
    ...config,
    plugins: (config.plugins ?? []).map((plugin) => {
      if (plugin === "expo-router") return ["expo-router", { origin: normalizedOrigin }];
      if (Array.isArray(plugin) && plugin[0] === "expo-router") {
        return ["expo-router", { ...(plugin[1] ?? {}), origin: normalizedOrigin }];
      }
      return plugin;
    }),
  };
}

function resolveAppConfig(config, variantName) {
  const variant = resolveBuildVariant(variantName);
  const configured = withRouterOrigin(config, variant.apiOrigin);
  return {
    ...configured,
    name: variant.appName,
    scheme: variant.scheme,
    ios: {
      ...(configured.ios ?? {}),
      bundleIdentifier: variant.bundleIdentifier,
      associatedDomains: [...variant.associatedDomains],
    },
    extra: {
      ...(configured.extra ?? {}),
      releaseAudience: variant.releaseAudience,
      buildEnvironment: {
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
      },
    },
  };
}

module.exports = ({ config }) => resolveAppConfig(config, process.env.APP_VARIANT);
module.exports.resolveAppConfig = resolveAppConfig;
module.exports.withRouterOrigin = withRouterOrigin;
