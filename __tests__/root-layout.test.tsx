import { render, within } from "@testing-library/react-native";
const mockBuildEnvironment = jest.fn(() => ({ buildType: "production", buildLabel: "PRODUCTION" }));
jest.mock("../src/config/build-environment", () => ({ getBuildEnvironment: () => mockBuildEnvironment() }));
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
jest.mock("expo-font", () => ({ loadAsync: jest.fn(() => new Promise(() => undefined)) }));
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
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => <View testID="safe-area-provider">{children}</View>,
    useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 0, left: 0 }),
  };
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
jest.mock("../src/features/auth/local-library-provider", () => {
  const { View } = require("react-native");
  return { LocalLibraryProvider: ({ children }: { children: React.ReactNode }) => <View testID="local-library-provider">{children}</View> };
});
jest.mock("../src/storage/memory-repository", () => ({ migrateDbIfNeeded: jest.fn() }));

import RootLayout from "../src/app/_layout";

describe("RootLayout", () => {
  beforeEach(() => {
    mockBuildEnvironment.mockReturnValue({ buildType: "production", buildLabel: "PRODUCTION" });
  });

  it("persistently identifies a Development/Staging build", async () => {
    mockBuildEnvironment.mockReturnValue({
      buildType: "development",
      buildLabel: "DEVELOPMENT · STAGING",
    });
    const screen = await render(<RootLayout />);
    expect(screen.getByText("DEVELOPMENT · STAGING")).toBeTruthy();
    expect(screen.getByTestId("build-environment-banner").props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingTop: 54 })]),
    );
  });

  it("does not show the development banner in production", async () => {
    const screen = await render(<RootLayout />);
    expect(screen.queryByText("DEVELOPMENT · STAGING")).toBeNull();
  });
  it("renders immediately without waiting for local fonts", async () => {
    const screen = await render(<RootLayout />);

    expect(screen.getByTestId("stack")).toBeTruthy();
  });

  it("registers nested route groups only at the root stack boundary", async () => {
    const screen = await render(<RootLayout />);

    expect(screen.getByTestId("screen-memory")).toBeTruthy();
    expect(screen.getByTestId("screen-recycle-bin")).toBeTruthy();
    expect(screen.queryByTestId("screen-memory/new")).toBeNull();
    expect(screen.queryByTestId("screen-memory/[id]")).toBeNull();
    expect(screen.queryByTestId("screen-recycle-bin/index")).toBeNull();
  });

  it("makes the local profile available around memory screens", async () => {
    const screen = await render(<RootLayout />);

    expect(screen.getByTestId("safe-area-provider")).toBeTruthy();
    expect(screen.getByTestId("auth-provider")).toBeTruthy();
    expect(screen.getByTestId("local-library-provider")).toBeTruthy();
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

    expect(screen.getByTestId("screen-city/[city]/manage").props.title).toBe("管理城市旅行册");
  });

  it("does not register commerce, backend, or NFC writer screens", async () => {
    const screen = await render(<RootLayout />);

    expect(screen.queryByTestId("screen-shop/[skuId]")).toBeNull();
    expect(screen.queryByTestId("screen-shop/orders")).toBeNull();
    expect(screen.queryByTestId("screen-shop/favorites")).toBeNull();
    expect(screen.queryByTestId("screen-backend/index")).toBeNull();
    expect(screen.queryByTestId("screen-nfc-demo/[city]")).toBeNull();
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
