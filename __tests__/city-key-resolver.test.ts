import { CityKeyResolver } from "../src/services/nfc/city-key-resolver";

describe("CityKeyResolver", () => {
  it("returns an in-app Hangzhou experience for a simulated key", () => {
    expect(new CityKeyResolver().resolve("hangzhou")).toEqual({
      city: "hangzhou",
      title: "杭州记忆钥匙",
      message: "已打开杭州城市记忆预览。",
    });
  });
});
