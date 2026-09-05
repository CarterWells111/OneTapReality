const { resolveAppConfig, withRouterOrigin } = require("../app.config");

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

  it("resolves explicit Beta and Development native identities", () => {
    expect(resolveAppConfig(baseConfig, "development-staging").ios.bundleIdentifier)
      .toBe("com.onereality.onetapreality.dev");
    expect(resolveAppConfig(baseConfig, "staging-testflight").ios.bundleIdentifier)
      .toBe("com.onereality.onetapreality");
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

  it("keeps raw production and staging links declarative but resolves an exact audience-specific entitlement", () => {
    const expoConfig = require("../app.json").expo;

    expect(expoConfig.ios.bundleIdentifier).toBe("com.onereality.onetapreality");
    expect(resolveAppConfig(expoConfig, "external-beta-staging").ios.associatedDomains)
      .toEqual(["applinks:staging.onetapreality.com"]);
    expect(resolveAppConfig(expoConfig, "staging-testflight").ios.associatedDomains)
      .toEqual(["applinks:staging.onetapreality.com"]);
    expect(resolveAppConfig(expoConfig, "production").ios.associatedDomains)
      .toEqual(["applinks:onetapreality.com"]);
    expect(resolveAppConfig(expoConfig, "development-staging").ios.associatedDomains)
      .toEqual([]);
    expect(expoConfig.android).toBeUndefined();
  });

  it("fails closed instead of resolving domains for an unknown release audience", () => {
    expect(() => resolveAppConfig(baseConfig, "unexpected")).toThrow(
      "Unsupported APP_VARIANT",
    );
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
    expect(expoConfig.ios.infoPlist.MinimumOSVersion).toBe("15.1");
  });

  it("declares clear iOS permissions for saving exports to the photo library", () => {
    const expoConfig = require("../app.json").expo;

    expect(expoConfig.plugins).toContainEqual([
      "expo-media-library",
      {
        photosPermission: expect.stringContaining("photos"),
        savePhotosPermission: expect.stringMatching(/save/iu),
      },
    ]);
    expect(expoConfig.plugins).toContainEqual([
      "expo-image-picker",
      {
        cameraPermission: false,
        microphonePermission: false,
        photosPermission: expect.any(String),
      },
    ]);
    expect(expoConfig.locales).toEqual({
      en: "./locales/en.json",
      "zh-Hans": "./locales/zh-Hans.json",
    });
  });

  it("uses OneTapReality as the package identifier", () => {
    const packageConfig = require("../package.json");
    const expoConfig = require("../app.json").expo;

    expect(packageConfig.name).toBe("onetapreality");
    expect(packageConfig.version).toBe("1.1.2");
    expect(expoConfig.version).toBe("1.1.2");
  });

  it("keeps native export packages compatible with Expo SDK 57", () => {
    const packageConfig = require("../package.json");

    expect(packageConfig.dependencies).toEqual(expect.objectContaining({
      "expo-print": "~57.0.1",
      "expo-sharing": "~57.0.18",
      "react-native-view-shot": "5.1.0",
    }));
  });

  it("does not expose Android build or local start entry points", () => {
    const easConfig = require("../eas.json");
    const packageConfig = require("../package.json");

    expect(easConfig.build["development-android"]).toBeUndefined();
    expect(packageConfig.scripts.android).toBeUndefined();
  });

  it("provides an isolated Alpha build that only exposes the staging API origin", () => {
    const easConfig = require("../eas.json");

    expect(easConfig.build.alpha).toEqual(expect.objectContaining({
      distribution: "internal",
      env: {
        APP_VARIANT: "alpha-staging",
      },
    }));
  });

  it("makes every local build profile's release audience explicit and fail-safe", () => {
    const profiles = require("../eas.json").build;

    expect(Object.fromEntries(
      Object.entries(profiles).map(([name, profile]: [string, any]) => [
        name,
        profile.env?.APP_VARIANT,
      ]),
    )).toEqual({
      development: "development-staging",
      preview: "production",
      alpha: "alpha-staging",
      "staging-testflight": "staging-testflight",
      "beta-external": "external-beta-staging",
      production: "production",
    });
  });

  it("keeps every local build profile on one explicit variant selector", () => {
    const profiles = require("../eas.json").build;

    expect(Object.fromEntries(
      Object.entries(profiles).map(([name, profile]: [string, any]) => [
        name,
        Object.keys(profile.env ?? {}),
      ]),
    )).toEqual({
      development: ["APP_VARIANT"],
      preview: ["APP_VARIANT"],
      alpha: ["APP_VARIANT"],
      "staging-testflight": ["APP_VARIANT"],
      "beta-external": ["APP_VARIANT"],
      production: ["APP_VARIANT"],
    });
  });

  it("keeps the local database and native application identity stable across build profiles", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const expoConfig = require("../app.json").expo;
    const easConfig = require("../eas.json");
    const rootLayout = fs.readFileSync(path.resolve(__dirname, "..", "src/app/_layout.tsx"), "utf8");
    const authStorage = fs.readFileSync(path.resolve(__dirname, "..", "src/features/auth/auth-storage.ts"), "utf8");
    const photoPersistence = fs.readFileSync(path.resolve(__dirname, "..", "src/features/memories/photo-persistence.ts"), "utf8");

    expect(rootLayout).toContain('databaseName="luyi.db"');
    expect(authStorage).toContain('"onetapreality.auth-session.v1"');
    expect(authStorage).toContain('"onetapreality.remembered-email.v1"');
    expect(photoPersistence).toContain('photos/accounts/${localAccountDirectorySegment(accountKey)}/${encodeURIComponent(memoryId)}/');
    expect(expoConfig.ios.bundleIdentifier).toBe("com.onereality.onetapreality");
    expect(expoConfig.android).toBeUndefined();
    expect(Object.keys(easConfig.build)).toEqual(expect.arrayContaining(["development", "preview", "alpha", "production"]));
    expect(Object.keys(easConfig.build)).not.toContain("development-android");
  });
});
