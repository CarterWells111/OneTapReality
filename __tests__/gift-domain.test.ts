import {
  addGiftMember,
  claimGift,
  createGift,
  disableGift,
  type Gift,
} from "../src/features/gifts/gift-domain";

describe("NFC gift domain", () => {
  const first = "owner@onetapreality.com";

  it("lets the first verified email claim an unclaimed gift as its owner", () => {
    const gift = claimGift(createGift("gift-1"), first);

    expect(gift.status).toBe("bound");
    expect(gift.members).toEqual([{ email: first, role: "owner" }]);
  });

  it("allows at most three distinct access emails including the owner", () => {
    const claimed = claimGift(createGift("gift-1"), first);
    const withTwoGuests = addGiftMember(addGiftMember(claimed, "a@example.com"), "b@example.com");

    expect(() => addGiftMember(withTwoGuests, "c@example.com")).toThrow("最多绑定 3 个邮箱");
    expect(() => addGiftMember(withTwoGuests, "A@example.com")).toThrow("已在访问名单中");
  });

  it("never lets a disabled gift be claimed again", () => {
    const disabled = disableGift(claimGift(createGift("gift-1"), first));

    expect(() => claimGift(disabled, "next@example.com")).toThrow("礼品已停用");
  });
});
