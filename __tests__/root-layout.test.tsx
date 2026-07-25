import { render, within } from "@testing-library/react-native";
jest.mock("expo-router", () => {
  const { View } = require("react-native");
  const Stack = function Stack({ children }: { children: React.ReactNode }) {
    return <View testID="stack">{children}</View>;
  };
  Stack.Screen = function StackScreen({ name, options }: { name: string; options?: { title?: string; presentation?: string } }) {
    return <View testID={`screen-${name}`} title={options?.title} options={options} />;
  };
  return { Stack };
});
jest.mock("expo-font", () => ({ useFonts: () => [true, null] }));
jest.mock("expo-sqlite", () => {
  const { View } = require("react-native");
  return { SQLiteProvider: ({ children }: { children: React.ReactNode }) => <View testID="sqlite-provider">{children}</View> };
});
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("react-native-gesture-handler", () => {
  const { View } = require("react-native");
  return { GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => <View testID="gesture-root">{children}</View> };
});
jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return { SafeAreaProvider: ({ children }: { children: React.ReactNode }) => <View testID="safe-area-provider">{children}</View> };
});
jest.mock("../src/features/memories/memories-provider", () => {
  const { View } = require("react-native");
  return { MemoriesProvider: ({ children }: { children: React.ReactNode }) => <View testID="memories-provider">{children}</View> };
});
jest.mock("../src/features/profile/profile-provider", () => {
  const { View } = require("react-native");
  return { ProfileProvider: ({ children }: { children: React.ReactNode }) => <View testID="profile-provider">{children}</View> };
});
jest.mock("../src/features/auth/auth-provider", () => {
  const { View } = require("react-native");
  return { AuthProvider: ({ children }: { children: React.ReactNode }) => <View testID="auth-provider">{children}</View> };
});
jest.mock("../src/storage/memory-repository", () => ({ migrateDbIfNeeded: jest.fn() }));

import RootLayout from "../src/app/_layout";

describe("RootLayout", () => {
  it("makes the local profile available around memory screens", async () => {
    const screen = await render(<RootLayout />);

    expect(screen.getByTestId("safe-area-provider")).toBeTruthy();
    expect(screen.getByTestId("auth-provider")).toBeTruthy();
    expect(
      within(screen.getByTestId("profile-provider")).getByTestId(
        "memories-provider",
      ),
    ).toBeTruthy();
  });

  it("registers the native privacy declaration route", async () => {
    const screen = await render(<RootLayout />);

    expect(screen.getByTestId("screen-privacy/index").props.title).toBe("数据与隐私");
  });

  it("registers the city collection management route", async () => {
    const screen = await render(<RootLayout />);

    expect(screen.getByTestId("screen-city/[city]/manage").props.title).toBe("Manage city collection");
  });

  it("registers the unvisited cities browser with its Chinese title", async () => {
    const screen = await render(<RootLayout />);

    expect(screen.getByTestId("screen-cities/unvisited").props.title).toBe("未打卡城市");
  });

  it("registers the native fullscreen city map as a full-screen modal", async () => {
    const screen = await render(<RootLayout />);

    expect(screen.getByTestId("screen-city-map/index").props.options).toMatchObject({
      presentation: "fullScreenModal",
    });
  });
});
