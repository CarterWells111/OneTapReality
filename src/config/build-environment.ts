import Constants from "expo-constants";

export type EnvironmentId = "staging" | "production";
export type BuildType = "development" | "testflight" | "internal" | "external-beta" | "production";
export type ReleaseAudience = "internal" | "external-beta" | "public";

export type BuildEnvironment = Readonly<{
  variant: string;
  environmentId: EnvironmentId;
  environmentLabel: "STAGING" | "PRODUCTION";
  buildType: BuildType;
  buildLabel: string;
  apiOrigin: string;
  giftUrlOrigin: string;
  bundleIdentifier: string;
  scheme: string;
  releaseAudience: ReleaseAudience;
}>;

const ENVIRONMENT_IDS = new Set<EnvironmentId>(["staging", "production"]);
const BUILD_TYPES = new Set<BuildType>([
  "development",
  "testflight",
  "internal",
  "external-beta",
  "production",
]);
const RELEASE_AUDIENCES = new Set<ReleaseAudience>(["internal", "external-beta", "public"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string" || !field || field !== field.trim()) {
    throw new Error(`Expo buildEnvironment has invalid ${key}`);
  }
  return field;
}

function requireCanonicalHttpsOrigin(origin: string, key: string) {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`Expo buildEnvironment has invalid ${key}`);
  }
  if (
    parsed.protocol !== "https:"
    || parsed.origin !== origin
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
    || parsed.username
    || parsed.password
    || parsed.port
  ) {
    throw new Error(`Expo buildEnvironment has invalid ${key}`);
  }
}

export function parseBuildEnvironment(value: unknown): BuildEnvironment {
  if (!isRecord(value)) {
    throw new Error("Expo buildEnvironment metadata is missing or invalid");
  }

  const environment = {
    variant: requireString(value, "variant"),
    environmentId: requireString(value, "environmentId") as EnvironmentId,
    environmentLabel: requireString(value, "environmentLabel") as BuildEnvironment["environmentLabel"],
    buildType: requireString(value, "buildType") as BuildType,
    buildLabel: requireString(value, "buildLabel"),
    apiOrigin: requireString(value, "apiOrigin"),
    giftUrlOrigin: requireString(value, "giftUrlOrigin"),
    bundleIdentifier: requireString(value, "bundleIdentifier"),
    scheme: requireString(value, "scheme"),
    releaseAudience: requireString(value, "releaseAudience") as ReleaseAudience,
  };

  if (!ENVIRONMENT_IDS.has(environment.environmentId)
    || environment.environmentLabel !== environment.environmentId.toUpperCase()) {
    throw new Error("Expo buildEnvironment label does not match environmentId");
  }
  if (!BUILD_TYPES.has(environment.buildType)) {
    throw new Error("Expo buildEnvironment has invalid buildType");
  }
  if (!RELEASE_AUDIENCES.has(environment.releaseAudience)) {
    throw new Error("Expo buildEnvironment has invalid releaseAudience");
  }
  requireCanonicalHttpsOrigin(environment.apiOrigin, "apiOrigin");
  requireCanonicalHttpsOrigin(environment.giftUrlOrigin, "giftUrlOrigin");

  const usesDevelopmentIdentity = environment.bundleIdentifier.endsWith(".dev")
    && environment.scheme.endsWith("-dev");
  if (environment.buildType === "development") {
    if (!usesDevelopmentIdentity
      || environment.buildLabel !== `DEVELOPMENT · ${environment.environmentLabel}`
      || environment.releaseAudience !== "internal") {
      throw new Error("Expo buildEnvironment does not match development identity");
    }
  } else if (environment.bundleIdentifier.endsWith(".dev") || environment.scheme.endsWith("-dev")) {
    throw new Error("Expo buildEnvironment exposes development identity outside Development");
  }

  if (environment.environmentId === "production") {
    if (environment.buildType !== "production" || environment.releaseAudience !== "public") {
      throw new Error("Expo buildEnvironment has invalid production pairing");
    }
  } else if (environment.buildType === "production") {
    throw new Error("Expo buildEnvironment has invalid staging pairing");
  }

  return Object.freeze(environment);
}

export function getBuildEnvironment(): BuildEnvironment {
  return parseBuildEnvironment(Constants.expoConfig?.extra?.buildEnvironment);
}
