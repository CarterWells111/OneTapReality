const { withRouterOrigin } = require("../app.config");

describe("Expo Router production origin", () => {
  const baseConfig = {
    name: "OneTapReality",
    slug: "onetapreality",
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

  it("registers the production gift link for both native platforms", () => {
    const expoConfig = require("../app.json").expo;

    expect(expoConfig.ios.bundleIdentifier).toBe("com.onereality.onetapreality");
    expect(expoConfig.ios.associatedDomains).toContain("applinks:onetapreality.com");
    expect(expoConfig.android.package).toBe("com.onetapreality.app");
    expect(expoConfig.android.intentFilters).toEqual(expect.arrayContaining([
      expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ host: "onetapreality.com", pathPrefix: "/gift" })]) }),
      expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ host: "onetapreality.com", pathPrefix: "/activate" })]) }),
    ]));
  });

  it("configures the NFC native module with the TAG-only iOS entitlement", () => {
    const expoConfig = require("../app.json").expo;

    expect(expoConfig.plugins).toContainEqual([
      "react-native-nfc-manager",
      {
        nfcPermission: expect.any(String),
        includeNdefEntitlement: false,
      },
    ]);
    expect(expoConfig.newArchEnabled).not.toBe(false);
  });

  it("declares clear iOS permissions for saving exports to the photo library", () => {
    const expoConfig = require("../app.json").expo;

    expect(expoConfig.plugins).toContainEqual([
      "expo-media-library",
      {
        photosPermission: expect.stringContaining("photos"),
        savePhotosPermission: expect.stringContaining("save"),
      },
    ]);
  });

  it("uses OneTapReality as the package identifier", () => {
    const packageConfig = require("../package.json");

    expect(packageConfig.name).toBe("onetapreality");
  });

  it("keeps native export packages compatible with Expo SDK 54", () => {
    const packageConfig = require("../package.json");

    expect(packageConfig.dependencies).toEqual(expect.objectContaining({
      "expo-print": "~15.0.8",
      "expo-sharing": "~14.0.8",
      "react-native-view-shot": "4.0.3",
    }));
  });

  it("provides an internal Android development client profile for NFC device testing", () => {
    const easConfig = require("../eas.json");

    expect(easConfig.build["development-android"]).toEqual(expect.objectContaining({
      developmentClient: true,
      distribution: "internal",
      env: expect.objectContaining({
        EXPO_PUBLIC_API_ORIGIN: "https://api.onetapreality.com",
      }),
      android: expect.objectContaining({ buildType: "apk" }),
    }));
  });
});
