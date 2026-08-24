import {
  getGiftUrlOrigin,
  requireAlphaEmailAllowed,
  requireGiftSharingEnabled,
} from "../src/server/gifts/alpha-safety";

function thrownBy(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("Expected action to throw");
}

describe("Alpha gift safety controls", () => {
  afterEach(() => {
    delete process.env.ALPHA_ALLOWED_EMAILS;
    delete process.env.GIFT_SHARING_ENABLED;
    delete process.env.GIFT_URL_ORIGIN;
  });

  it("uses the configured HTTPS origin for every gift URL", () => {
    process.env.GIFT_URL_ORIGIN = "https://staging.onetapreality.com/";

    expect(getGiftUrlOrigin()).toBe("https://staging.onetapreality.com");
  });

  it("rejects an email outside the Alpha allowlist", () => {
    process.env.ALPHA_ALLOWED_EMAILS = "owner@example.com, viewer@example.com";

    expect(thrownBy(() => requireAlphaEmailAllowed("outside@example.com"))).toMatchObject({ status: 403, code: "beta_invite_required" });
  });

  it("keeps email access open when no Alpha allowlist is configured", () => {
    expect(() => requireAlphaEmailAllowed("outside@example.com")).not.toThrow();
  });

  it("allows the fail-closed external-Beta review identity without duplicating it in the Alpha allowlist", () => {
    const reviewEnvironment = {
      ALPHA_ALLOWED_EMAILS: "invited@example.com",
      APPLE_REVIEW_ACCESS_ENABLED: "true",
      APPLE_REVIEW_EMAIL: "reviewer@example.test",
      APPLE_REVIEW_CODE: "654321",
      APPLE_REVIEW_FIXTURE_SECRET: "fixture-secret-at-least-thirty-two-bytes-long",
      APPLE_REVIEW_CLAIM_TOKEN: "A".repeat(43),
      GIFT_TOKEN_PEPPER: "gift-token-pepper",
      GIFT_URL_ORIGIN: "https://staging.onetapreality.com",
      RELEASE_AUDIENCE: "external-beta",
    };

    expect(() => requireAlphaEmailAllowed(" Reviewer@Example.Test ", reviewEnvironment)).not.toThrow();
    for (const override of [
      { APPLE_REVIEW_ACCESS_ENABLED: "false" },
      { RELEASE_AUDIENCE: "public" },
      { GIFT_URL_ORIGIN: "https://onetapreality.com" },
    ]) {
      expect(thrownBy(() => requireAlphaEmailAllowed("reviewer@example.test", { ...reviewEnvironment, ...override })))
        .toMatchObject({ status: 403, code: "beta_invite_required" });
    }
  });

  it("stops public gift sharing when the incident switch is disabled", () => {
    process.env.GIFT_SHARING_ENABLED = "false";

    expect(thrownBy(() => requireGiftSharingEnabled())).toMatchObject({ status: 503, code: "gift_sharing_paused" });
  });
});
