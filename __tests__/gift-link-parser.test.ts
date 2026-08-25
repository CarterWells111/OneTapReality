import {
  GiftLinkError,
  parseGiftLink,
} from "../src/services/nfc/gift-link-parser";

const ORIGIN = "https://staging.onetapreality.com";
const TOKEN = "Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE";

describe("gift NFC link parser", () => {
  it("accepts only the current environment's canonical HTTPS gift route", () => {
    expect(parseGiftLink(`${ORIGIN}/gift/${TOKEN}`, ORIGIN)).toEqual({
      pathname: `/gift/${TOKEN}`,
      token: TOKEN,
    });
  });

  it.each([
    `http://staging.onetapreality.com/gift/${TOKEN}`,
    `https://onetapreality.com/gift/${TOKEN}`,
    `https://staging.onetapreality.com.evil.example/gift/${TOKEN}`,
    `https://user@staging.onetapreality.com/gift/${TOKEN}`,
    `https://staging.onetapreality.com:443/gift/${TOKEN}`,
    `${ORIGIN}/gift/${TOKEN}?preview=true`,
    `${ORIGIN}/gift/${TOKEN}#fragment`,
    `${ORIGIN}/gift/${TOKEN}/`,
    `${ORIGIN}/other/${TOKEN}`,
    `${ORIGIN}/gift/short`,
    `${ORIGIN}/gift/${"A".repeat(42)}!`,
    ` ${ORIGIN}/gift/${TOKEN}`,
  ])("rejects a non-canonical or foreign URL without exposing a token: %s", (url) => {
    expect(() => parseGiftLink(url, ORIGIN)).toThrow(GiftLinkError);
  });

  it.each([
    "",
    "http://staging.onetapreality.com",
    "https://user@staging.onetapreality.com",
    "https://staging.onetapreality.com/path",
    "https://staging.onetapreality.com/",
  ])("fails closed when the configured gift origin is not canonical HTTPS", (origin) => {
    try {
      parseGiftLink(`${ORIGIN}/gift/${TOKEN}`, origin);
      throw new Error("expected parseGiftLink to reject invalid configuration");
    } catch (error) {
      expect(error).toMatchObject({ code: "GIFT_ORIGIN_INVALID" });
    }
  });
});
