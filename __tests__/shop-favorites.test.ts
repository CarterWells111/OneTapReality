import { isFavoriteSku, toggleFavoriteSku } from "../src/features/commerce/shop/favorites";

describe("toggleFavoriteSku", () => {
  it("adds a new sku to the front of the list", () => {
    expect(toggleFavoriteSku(["sku-a"], "sku-b")).toEqual(["sku-b", "sku-a"]);
  });

  it("removes a sku that is already favorited", () => {
    expect(toggleFavoriteSku(["sku-a", "sku-b"], "sku-a")).toEqual(["sku-b"]);
  });

  it("does not mutate the original list", () => {
    const original = ["sku-a"];
    toggleFavoriteSku(original, "sku-b");
    expect(original).toEqual(["sku-a"]);
  });

  it("deduplicates corrupted stored lists when toggling", () => {
    expect(toggleFavoriteSku(["sku-a", "sku-a", "sku-b"], "sku-c")).toEqual([
      "sku-c",
      "sku-a",
      "sku-b",
    ]);
  });
});

describe("isFavoriteSku", () => {
  it("reports membership", () => {
    expect(isFavoriteSku(["sku-a"], "sku-a")).toBe(true);
    expect(isFavoriteSku(["sku-a"], "sku-b")).toBe(false);
  });
});
