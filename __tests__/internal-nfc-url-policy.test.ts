type PolicyError = Error & { readonly code: string };

type InternalNfcUrlPolicy = {
  readonly activationUrl: string;
  readonly apiOrigin: string;
  readonly giftOrigin: string;
  readonly validateGiftUrl: (giftUrl: unknown) => string;
  readonly validateReplacement: (
    activationUrl: unknown,
    giftUrl: unknown,
  ) => string;
};

type CreatePolicy = (input: {
  readonly apiOrigin?: string;
  readonly giftOrigin?: string;
}) => InternalNfcUrlPolicy;

const policyModule = (() => {
  try {
    return require("../src/services/nfc/internal-nfc-url-policy") as {
      readonly createInternalNfcUrlPolicy?: CreatePolicy;
    };
  } catch {
    return {};
  }
})();

function requirePolicyFactory(): CreatePolicy | null {
  const factory = policyModule.createInternalNfcUrlPolicy;
  if (typeof factory !== "function") {
    expect(factory).toEqual(expect.any(Function));
    return null;
  }
  return factory;
}

function capturePolicyError(action: () => unknown): PolicyError {
  try {
    action();
  } catch (error) {
    return error as PolicyError;
  }
  throw new Error("Expected policy validation to fail");
}

const TOKEN = "A".repeat(43);
const STAGING_API_ORIGIN = "https://api-staging.onetapreality.com";
const STAGING_GIFT_ORIGIN = "https://staging.onetapreality.com";
const PRODUCTION_API_ORIGIN = "https://api.onetapreality.com";
const PRODUCTION_GIFT_ORIGIN = "https://onetapreality.com";

describe("internal NFC URL policy", () => {
  it("normalizes trailing slashes and accepts the exact staging environment", () => {
    const createPolicy = requirePolicyFactory();
    if (!createPolicy) return;
    const policy = createPolicy({
      apiOrigin: `${STAGING_API_ORIGIN}///`,
      giftOrigin: `${STAGING_GIFT_ORIGIN}/`,
    });
    const giftUrl = `${STAGING_GIFT_ORIGIN}/gift/${TOKEN}`;

    expect(policy).toEqual(expect.objectContaining({
      activationUrl: `${STAGING_GIFT_ORIGIN}/activate`,
      apiOrigin: STAGING_API_ORIGIN,
      giftOrigin: STAGING_GIFT_ORIGIN,
    }));
    expect(policy.validateGiftUrl(giftUrl)).toBe(giftUrl);
    expect(policy.validateReplacement(policy.activationUrl, giftUrl)).toBe(giftUrl);
  });

  it("accepts the exact production environment", () => {
    const createPolicy = requirePolicyFactory();
    if (!createPolicy) return;
    const policy = createPolicy({
      apiOrigin: PRODUCTION_API_ORIGIN,
      giftOrigin: PRODUCTION_GIFT_ORIGIN,
    });
    const giftUrl = `${PRODUCTION_GIFT_ORIGIN}/gift/${TOKEN}`;

    expect(policy.activationUrl).toBe(`${PRODUCTION_GIFT_ORIGIN}/activate`);
    expect(policy.validateGiftUrl(giftUrl)).toBe(giftUrl);
  });

  it.each([
    [undefined, STAGING_GIFT_ORIGIN],
    [STAGING_API_ORIGIN, undefined],
    ["", STAGING_GIFT_ORIGIN],
    [STAGING_API_ORIGIN, ""],
    [STAGING_API_ORIGIN, PRODUCTION_GIFT_ORIGIN],
    [PRODUCTION_API_ORIGIN, STAGING_GIFT_ORIGIN],
    ["https://api.example.com", STAGING_GIFT_ORIGIN],
    [` ${STAGING_API_ORIGIN}`, STAGING_GIFT_ORIGIN],
  ])("fails closed for a missing, unknown, or mismatched environment", (apiOrigin, giftOrigin) => {
    const createPolicy = requirePolicyFactory();
    if (!createPolicy) return;

    const error = capturePolicyError(() => createPolicy({ apiOrigin, giftOrigin }));

    expect(error).toEqual(expect.objectContaining({
      code: "NFC_ENVIRONMENT_INVALID",
      message: "NFC environment configuration is invalid.",
    }));
    for (const configuredOrigin of [apiOrigin, giftOrigin]) {
      if (configuredOrigin) {
        expect(error.message).not.toContain(configuredOrigin);
      }
    }
  });

  it.each([
    `http://staging.onetapreality.com/gift/${TOKEN}`,
    `https://user:pass@staging.onetapreality.com/gift/${TOKEN}`,
    `https://staging.onetapreality.com:444/gift/${TOKEN}`,
    `https://staging.onetapreality.com:443/gift/${TOKEN}`,
    `${STAGING_GIFT_ORIGIN}/gift/${"A".repeat(42)}`,
    `${STAGING_GIFT_ORIGIN}/gift/${"A".repeat(44)}`,
    `${STAGING_GIFT_ORIGIN}/gift/${"A".repeat(42)}+`,
    `${STAGING_GIFT_ORIGIN}/gift/${TOKEN}/extra`,
    `${STAGING_GIFT_ORIGIN}/gift/${TOKEN}?source=internal`,
    `${STAGING_GIFT_ORIGIN}/gift/${TOKEN}#fragment`,
    "not-a-url",
  ])("rejects a malformed gift URL without disclosing it", (giftUrl) => {
    const createPolicy = requirePolicyFactory();
    if (!createPolicy) return;
    const policy = createPolicy({
      apiOrigin: STAGING_API_ORIGIN,
      giftOrigin: STAGING_GIFT_ORIGIN,
    });

    const error = capturePolicyError(() => policy.validateGiftUrl(giftUrl));

    expect(error).toEqual(expect.objectContaining({
      code: "NFC_GIFT_URL_INVALID",
      message: "Reserved gift link is invalid. Stop and contact support.",
    }));
    expect(error.message).not.toContain(giftUrl);
    expect(error.message).not.toContain(TOKEN);
  });

  it("rejects cross-environment gifts and activation links without disclosure", () => {
    const createPolicy = requirePolicyFactory();
    if (!createPolicy) return;
    const policy = createPolicy({
      apiOrigin: STAGING_API_ORIGIN,
      giftOrigin: STAGING_GIFT_ORIGIN,
    });
    const productionGiftUrl = `${PRODUCTION_GIFT_ORIGIN}/gift/${TOKEN}`;
    const productionPolicy = createPolicy({
      apiOrigin: PRODUCTION_API_ORIGIN,
      giftOrigin: PRODUCTION_GIFT_ORIGIN,
    });

    for (const action of [
      () => policy.validateGiftUrl(productionGiftUrl),
      () => productionPolicy.validateGiftUrl(
        `${STAGING_GIFT_ORIGIN}/gift/${TOKEN}`,
      ),
      () => policy.validateReplacement(
        `${PRODUCTION_GIFT_ORIGIN}/activate`,
        `${STAGING_GIFT_ORIGIN}/gift/${TOKEN}`,
      ),
    ]) {
      const error = capturePolicyError(action);
      expect(error).toEqual(expect.objectContaining({
        code: "NFC_URL_ENVIRONMENT_MISMATCH",
        message: "NFC link belongs to a different environment. Stop and contact support.",
      }));
      expect(error.message).not.toContain(TOKEN);
      expect(error.message).not.toContain("https://");
    }
  });
});
