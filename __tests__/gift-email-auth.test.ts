import { createGiftEmailCode, isGiftEmailCodeValid, normalizeGiftEmail } from "../src/server/gifts/email-auth";

describe("gift email authentication", () => {
  it("normalizes an email and validates an unexpired one-time code hash", async () => {
    const created = await createGiftEmailCode(" Owner@Example.com ", "pepper", () => 123456, "2026-07-24T00:00:00.000Z");

    expect(created.email).toBe("owner@example.com");
    await expect(isGiftEmailCodeValid(created.codeHash, "123456", "pepper", "2026-07-24T00:04:59.000Z", created.expiresAt)).resolves.toBe(true);
    await expect(isGiftEmailCodeValid(created.codeHash, "123456", "pepper", "2026-07-24T00:05:00.000Z", created.expiresAt)).resolves.toBe(false);
  });

  it("uses cryptographic randomness for the default verification code", async () => {
    const random = jest.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random must not be used for authentication codes");
    });

    try {
      const created = await createGiftEmailCode("owner@example.com", "pepper");
      expect(created.code).toMatch(/^\d{6}$/u);
    } finally {
      random.mockRestore();
    }
  });
});
