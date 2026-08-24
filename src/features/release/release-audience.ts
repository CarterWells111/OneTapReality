export const RELEASE_AUDIENCES = ["internal", "external-beta"] as const;

export type ReleaseAudience = (typeof RELEASE_AUDIENCES)[number];

export function parseReleaseAudience(value: unknown): ReleaseAudience {
  const normalized = typeof value === "string" && value.trim() ? value.trim() : "internal";
  if ((RELEASE_AUDIENCES as readonly string[]).includes(normalized)) {
    return normalized as ReleaseAudience;
  }
  throw new Error(`Unsupported release audience: ${normalized}`);
}

export function isExternalBetaAudience(audience: ReleaseAudience): boolean {
  return audience === "external-beta";
}
