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

  it("stops public gift sharing when the incident switch is disabled", () => {
    process.env.GIFT_SHARING_ENABLED = "false";

    expect(thrownBy(() => requireGiftSharingEnabled())).toMatchObject({ status: 503, code: "gift_sharing_paused" });
  });
});
