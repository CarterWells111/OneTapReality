import type { ConfigContext, ExpoConfig } from "expo/config";

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/u, "");
}

export function withRouterOrigin<T extends Partial<ExpoConfig>>(config: T, origin?: string): T {
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
  } as T;
}

export default ({ config }: ConfigContext): ExpoConfig =>
  withRouterOrigin(config, process.env.EXPO_PUBLIC_API_ORIGIN) as ExpoConfig;
