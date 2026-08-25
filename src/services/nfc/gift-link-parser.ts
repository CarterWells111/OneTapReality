const GIFT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export type GiftLinkErrorCode =
  | "GIFT_ORIGIN_INVALID"
  | "GIFT_LINK_INVALID"
  | "GIFT_LINK_ENVIRONMENT_MISMATCH";

export class GiftLinkError extends Error {
  constructor(public readonly code: GiftLinkErrorCode) {
    super("The gift link is not valid for this app environment.");
    this.name = "GiftLinkError";
  }
}

export type ParsedGiftLink = {
  pathname: `/gift/${string}`;
  token: string;
};

function requireCanonicalOrigin(expectedOrigin: string): URL {
  if (!expectedOrigin || expectedOrigin !== expectedOrigin.trim() || expectedOrigin.endsWith("/")) {
    throw new GiftLinkError("GIFT_ORIGIN_INVALID");
  }

  try {
    const parsed = new URL(expectedOrigin);
    if (
      parsed.protocol !== "https:"
      || parsed.origin !== expectedOrigin
      || parsed.pathname !== "/"
      || parsed.search
      || parsed.hash
      || parsed.username
      || parsed.password
      || parsed.port
    ) {
      throw new GiftLinkError("GIFT_ORIGIN_INVALID");
    }
    return parsed;
  } catch (error) {
    if (error instanceof GiftLinkError) throw error;
    throw new GiftLinkError("GIFT_ORIGIN_INVALID");
  }
}

export function parseGiftLink(rawUrl: string, expectedOrigin: string): ParsedGiftLink {
  requireCanonicalOrigin(expectedOrigin);
  if (!rawUrl || rawUrl !== rawUrl.trim()) {
    throw new GiftLinkError("GIFT_LINK_INVALID");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new GiftLinkError("GIFT_LINK_INVALID");
  }

  if (parsed.origin !== expectedOrigin || !rawUrl.startsWith(`${expectedOrigin}/`)) {
    throw new GiftLinkError("GIFT_LINK_ENVIRONMENT_MISMATCH");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.port
    || parsed.search
    || parsed.hash
    || `${parsed.origin}${parsed.pathname}` !== rawUrl
  ) {
    throw new GiftLinkError("GIFT_LINK_INVALID");
  }

  const match = /^\/gift\/([A-Za-z0-9_-]{43})$/u.exec(parsed.pathname);
  const token = match?.[1];
  if (!token || !GIFT_TOKEN_PATTERN.test(token)) {
    throw new GiftLinkError("GIFT_LINK_INVALID");
  }

  return { pathname: `/gift/${token}`, token };
}
