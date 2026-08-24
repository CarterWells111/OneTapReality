import { normalizeAccountEmail } from "./repository";

export type AppleReviewEnvironment = {
  APPLE_REVIEW_ACCESS_ENABLED?: string;
  APPLE_REVIEW_EMAIL?: string;
  APPLE_REVIEW_CODE?: string;
  APPLE_REVIEW_FIXTURE_SECRET?: string;
  APPLE_REVIEW_CLAIM_TOKEN?: string;
  GIFT_TOKEN_PEPPER?: string;
  GIFT_URL_ORIGIN?: string;
  RELEASE_AUDIENCE?: string;
};

export type AppleReviewAccess = {
  email: string;
  fixedCode: string;
  fixtureSecret: string;
  claimToken: string;
  giftTokenPepper: string;
  giftUrlOrigin: "https://staging.onetapreality.com";
};

const stagingGiftOrigin = "https://staging.onetapreality.com" as const;

function hasExactStagingOrigin(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.origin === stagingGiftOrigin
      && (parsed.pathname === "/" || parsed.pathname === "")
      && !parsed.search
      && !parsed.hash
      && !parsed.username
      && !parsed.password;
  } catch {
    return false;
  }
}

/** Fail-closed server-only gate for the dedicated App Review identity. */
export function getAppleReviewAccess(
  requestedEmail: string,
  environment: AppleReviewEnvironment = process.env,
): AppleReviewAccess | null {
  if (environment.APPLE_REVIEW_ACCESS_ENABLED?.trim().toLowerCase() !== "true") return null;
  if (environment.RELEASE_AUDIENCE?.trim() !== "external-beta") return null;
  if (!hasExactStagingOrigin(environment.GIFT_URL_ORIGIN)) return null;

  const configuredEmail = normalizeAccountEmail(environment.APPLE_REVIEW_EMAIL ?? "");
  const email = normalizeAccountEmail(requestedEmail);
  const fixedCode = environment.APPLE_REVIEW_CODE?.trim() ?? "";
  const fixtureSecret = environment.APPLE_REVIEW_FIXTURE_SECRET ?? "";
  const claimToken = environment.APPLE_REVIEW_CLAIM_TOKEN?.trim() ?? "";
  const giftTokenPepper = environment.GIFT_TOKEN_PEPPER ?? "";
  if (!configuredEmail || email !== configuredEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(configuredEmail)) return null;
  if (!/^\d{6}$/u.test(fixedCode)) return null;
  if (fixtureSecret.length < 32 || !/^[A-Za-z0-9_-]{43}$/u.test(claimToken) || !giftTokenPepper) return null;

  return { email, fixedCode, fixtureSecret, claimToken, giftTokenPepper, giftUrlOrigin: stagingGiftOrigin };
}
