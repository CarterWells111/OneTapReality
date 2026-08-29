export type InternalNfcUrlPolicyErrorCode =
  | "NFC_ENVIRONMENT_INVALID"
  | "NFC_GIFT_URL_INVALID"
  | "NFC_URL_ENVIRONMENT_MISMATCH";

export class InternalNfcUrlPolicyError extends Error {
  constructor(
    public readonly code: InternalNfcUrlPolicyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "InternalNfcUrlPolicyError";
  }
}

export type InternalNfcUrlPolicy = {
  readonly activationUrl: string;
  readonly apiOrigin: string;
  readonly giftOrigin: string;
  readonly validateGiftUrl: (giftUrl: unknown) => string;
  readonly validateReplacement: (
    activationUrl: unknown,
    giftUrl: unknown,
  ) => string;
};

const KNOWN_ENVIRONMENT_PAIRS = new Map([
  [
    "https://api-staging.onetapreality.com",
    "https://staging.onetapreality.com",
  ],
  ["https://api.onetapreality.com", "https://onetapreality.com"],
]);

function environmentError() {
  return new InternalNfcUrlPolicyError(
    "NFC_ENVIRONMENT_INVALID",
    "NFC environment configuration is invalid.",
  );
}

function invalidGiftUrlError() {
  return new InternalNfcUrlPolicyError(
    "NFC_GIFT_URL_INVALID",
    "Reserved gift link is invalid. Stop and contact support.",
  );
}

function environmentMismatchError() {
  return new InternalNfcUrlPolicyError(
    "NFC_URL_ENVIRONMENT_MISMATCH",
    "NFC link belongs to a different environment. Stop and contact support.",
  );
}

function normalizeTrailingSlash(value: unknown): string {
  if (typeof value !== "string") throw environmentError();
  const normalized = value.replace(/\/+$/u, "");
  if (!normalized) throw environmentError();
  return normalized;
}

export function createInternalNfcUrlPolicy({
  apiOrigin: rawApiOrigin,
  giftOrigin: rawGiftOrigin,
}: {
  readonly apiOrigin?: string;
  readonly giftOrigin?: string;
}): InternalNfcUrlPolicy {
  const apiOrigin = normalizeTrailingSlash(rawApiOrigin);
  const giftOrigin = normalizeTrailingSlash(rawGiftOrigin);
  if (KNOWN_ENVIRONMENT_PAIRS.get(apiOrigin) !== giftOrigin) {
    throw environmentError();
  }

  const activationUrl = `${giftOrigin}/activate`;

  const validateGiftUrl = (giftUrl: unknown): string => {
    if (typeof giftUrl !== "string") throw invalidGiftUrlError();
    let parsed: URL;
    try {
      parsed = new URL(giftUrl);
    } catch {
      throw invalidGiftUrlError();
    }
    if (
      parsed.protocol !== "https:"
      || parsed.username
      || parsed.password
      || parsed.port
    ) {
      throw invalidGiftUrlError();
    }
    if (parsed.origin !== giftOrigin) throw environmentMismatchError();

    const giftPrefix = `${giftOrigin}/gift/`;
    const token = giftUrl.startsWith(giftPrefix)
      ? giftUrl.slice(giftPrefix.length)
      : "";
    if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) {
      throw invalidGiftUrlError();
    }
    return giftUrl;
  };

  return {
    activationUrl,
    apiOrigin,
    giftOrigin,
    validateGiftUrl,
    validateReplacement(activationUrlToReplace, giftUrl) {
      if (activationUrlToReplace !== activationUrl) {
        throw environmentMismatchError();
      }
      return validateGiftUrl(giftUrl);
    },
  };
}
