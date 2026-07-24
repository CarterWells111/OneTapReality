import { isGiftAdminEmail } from "../src/server/gifts/admin-auth";

describe("gift developer allowlist", () => {
  it("only accepts normalized emails listed in the server allowlist", () => {
    expect(isGiftAdminEmail(" Dev@OneTapReality.com ", "dev@onetapreality.com,ops@example.com")).toBe(true);
    expect(isGiftAdminEmail("visitor@example.com", "dev@onetapreality.com,ops@example.com")).toBe(false);
    expect(isGiftAdminEmail("dev@onetapreality.com", undefined)).toBe(false);
  });
});
