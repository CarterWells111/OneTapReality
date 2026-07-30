import { ApiError } from "../http/errors";

type AlphaSafetyEnvironment = {
  ALPHA_ALLOWED_EMAILS?: string;
  GIFT_SHARING_ENABLED?: string;
  GIFT_URL_ORIGIN?: string;
};

const productionGiftOrigin = "https://onetapreality.com";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getGiftUrlOrigin(environment: AlphaSafetyEnvironment = process.env): string {
  const configuredOrigin = environment.GIFT_URL_ORIGIN?.trim() || productionGiftOrigin;
  try {
    const origin = new URL(configuredOrigin);
    if (origin.protocol !== "https:" || !origin.hostname) throw new Error("Gift URL origin must use HTTPS");
    return origin.origin;
  } catch {
    throw new ApiError(500, "gift_url_origin_invalid", "Gift URL origin must be an HTTPS origin");
  }
}

export function requireAlphaEmailAllowed(email: string, environment: AlphaSafetyEnvironment = process.env): void {
  const allowlist = environment.ALPHA_ALLOWED_EMAILS
    ?.split(",")
    .map(normalizeEmail)
    .filter(Boolean) ?? [];
  if (allowlist.length > 0 && !allowlist.includes(normalizeEmail(email))) {
    throw new ApiError(403, "beta_invite_required", "This email is not invited to the Alpha");
  }
}

export function requireGiftSharingEnabled(environment: AlphaSafetyEnvironment = process.env): void {
  const configuredValue = environment.GIFT_SHARING_ENABLED?.trim().toLowerCase();
  if (["false", "0", "off", "disabled"].includes(configuredValue ?? "")) {
    throw new ApiError(503, "gift_sharing_paused", "Gift sharing is temporarily paused");
  }
}
