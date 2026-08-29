// @ts-nocheck
// EAS CLI loads this .ts file as CommonJS during project initialization.
// Keep it valid JavaScript so both EAS and Expo CLI can evaluate it.
const {
  normalizeReleaseAudience,
} = require("./scripts/metro-activate-entry-resolver.cjs");

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

function withReleaseAudience(config, audience) {
  return {
    ...config,
    extra: {
      ...(config.extra ?? {}),
      releaseAudience: normalizeReleaseAudience(audience),
    },
  };
}

function withAssociatedDomains(config, audience) {
  const normalizedAudience = normalizeReleaseAudience(audience);
  const associatedDomains = normalizedAudience === "public"
    ? ["applinks:onetapreality.com"]
    : ["applinks:staging.onetapreality.com"];
  return {
    ...config,
    ios: {
      ...(config.ios ?? {}),
      associatedDomains,
    },
  };
}

module.exports = ({ config }) => {
  const audience = process.env.EXPO_PUBLIC_RELEASE_AUDIENCE;
  return withReleaseAudience(
    withAssociatedDomains(
      withRouterOrigin(config, process.env.EXPO_PUBLIC_API_ORIGIN),
      audience,
    ),
    audience,
  );
};
module.exports.withAssociatedDomains = withAssociatedDomains;
module.exports.withRouterOrigin = withRouterOrigin;
module.exports.withReleaseAudience = withReleaseAudience;
