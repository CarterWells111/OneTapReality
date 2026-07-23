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

  it("uses the local OneTapReality images in both Expo icon asset entry points", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const expoConfig = require("../app.json").expo;
    const iconDefinitionPath = path.resolve(__dirname, "..", "assets/expo.icon/icon.json");
    const iconDefinition = JSON.parse(fs.readFileSync(iconDefinitionPath, "utf8"));
    const imageNames = iconDefinition.groups.flatMap((group: { layers: Array<{ "image-name": string }> }) =>
      group.layers.map((layer) => layer["image-name"])
    );

    expect(expoConfig.icon).toBe("./assets/images/onetapreality-icon.png");
    expect(expoConfig.ios.icon).toBe("./assets/expo.icon");
    expect(imageNames).toContain("onetapreality-icon.png");
    expect(imageNames).not.toContain("expo-symbol 2.svg");
    expect(fs.existsSync(path.resolve(__dirname, "..", "assets/expo.icon/Assets/onetapreality-icon.png"))).toBe(true);
  });
});
