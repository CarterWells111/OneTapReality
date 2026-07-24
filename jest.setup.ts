import "react-native-gesture-handler/jestSetup";

import "react-native-gesture-handler/jestSetup";

jest.mock("expo-font", () => ({ useFonts: () => [true, null] }));

// Global mock: useSafeAreaInsets returns zero insets in tests without SafeAreaProvider
jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context");
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
