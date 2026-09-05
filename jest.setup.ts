import "react-native-gesture-handler/jestSetup";

jest.mock("expo-font", () => ({ useFonts: () => [true, null] }));
const Constants = require("expo-constants").default;
Constants.expoConfig.extra = {
  ...(Constants.expoConfig.extra ?? {}),
  buildEnvironment: {
        variant: "production",
        environmentId: "production",
        environmentLabel: "PRODUCTION",
        buildType: "production",
        buildLabel: "PRODUCTION",
        apiOrigin: "https://api.onetapreality.com",
        giftUrlOrigin: "https://onetapreality.com",
        bundleIdentifier: "com.onereality.onetapreality",
        scheme: "onetapreality",
        releaseAudience: "public",
        contractChecksum: "ffac6c7d",
  },
};
jest.mock("expo-media-library/legacy", () => ({
  getAssetInfoAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  saveToLibraryAsync: jest.fn(),
}));
jest.mock("react-native-worklets", () => require("react-native-worklets/src/mock"));

// Global mock: useSafeAreaInsets returns zero insets in tests without SafeAreaProvider
jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context");
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
