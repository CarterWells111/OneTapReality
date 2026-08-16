import * as databaseSchema from "../src/server/db/schema";
import * as giftRepository from "../src/server/gifts/repository";

describe("legacy gift authentication storage removal", () => {
  it("does not expose the retired gift email-code and session tables", () => {
    expect(databaseSchema).not.toHaveProperty("giftEmailCodes");
    expect(databaseSchema).not.toHaveProperty("giftSessions");
  });

  it("does not expose repository operations for the retired tables", () => {
    expect(giftRepository).not.toHaveProperty("createGiftEmailCode");
    expect(giftRepository).not.toHaveProperty("isGiftEmailCodeRateLimited");
    expect(giftRepository).not.toHaveProperty("consumeGiftEmailCode");
    expect(giftRepository).not.toHaveProperty("createGiftSession");
    expect(giftRepository).not.toHaveProperty("getGiftSessionEmail");
  });
});
