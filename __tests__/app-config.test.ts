import { withRouterOrigin } from "../app.config";

describe("Expo Router production origin", () => {
  const baseConfig = {
    name: "OneTapReality",
    slug: "travel-memory-demo",
    plugins: ["expo-router", "expo-sqlite"],
  };

  it("injects the Railway origin into the Expo Router plugin", () => {
    const config = withRouterOrigin(baseConfig, "https://example.up.railway.app/");

    expect(config.plugins).toContainEqual([
      "expo-router",
      { origin: "https://example.up.railway.app" },
    ]);
  });

  it("leaves the development config unchanged without an origin", () => {
    expect(withRouterOrigin(baseConfig, undefined)).toEqual(baseConfig);
  });

  it("uses the local OneTapReality logo for the Expo Go preview icon", () => {
    const expoConfig = require("../app.json").expo;

    expect(expoConfig.icon).toBe("./assets/images/onetapreality-icon.png");
  });
});
