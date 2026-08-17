import { render } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockMemories = jest.fn();
const mockProfile = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({
    memories: mockMemories(),
    isReady: true,
    clearAllMemories: jest.fn(),
  }),
}));
jest.mock("../src/features/profile/profile-provider", () => ({
  useProfile: () => ({ profile: mockProfile(), isProfileReady: true }),
}));
jest.mock("../src/features/auth/auth-provider", () => ({
  useAuth: () => ({
    isAuthReady: true,
    signOut: jest.fn(),
    switchAccount: jest.fn(),
    user: null,
  }),
}));

import MemoriesHomeScreen from "../src/app/(tabs)/index";
import ProfileScreen from "../src/app/(tabs)/profile";

describe("OneTapReality brand copy", () => {
  beforeEach(() => {
    mockMemories.mockReturnValue([]);
    mockProfile.mockReturnValue({ avatarUri: null, nickname: "小林" });
  });

  it("shows the OneTapReality home title and slogan", async () => {
    const screen = await render(<MemoriesHomeScreen />);

    expect(screen.getByText("OneTapReality｜一触如初")).toBeTruthy();
    expect(screen.getByText("让每一次触碰，都回到故事最初的地方。")).toBeTruthy();
    expect(screen.getByText("选择照片，开启一册专属你们的旅行记忆。")).toBeTruthy();
  });

  it("keeps the OneTapReality slogan as the default profile bio", async () => {
    const screen = await render(<ProfileScreen />);

    expect(screen.getByText("让每一次触碰，都回到故事最初的地方。")).toBeTruthy();
  });

  it("uses OneTapReality identifiers in app configuration", () => {
    const expo = require("../app.json").expo;

    expect(expo.name).toBe("OneTapReality");
    expect(expo.version).toBe("1.1.0");
    expect(expo.slug).toBe("onetapreality");
    expect(expo.scheme).toBe("onetapreality");
    expect(expo.android).toBeUndefined();
    const imagePickerPlugin = expo.plugins.find((plugin: unknown) => Array.isArray(plugin) && plugin[0] === "expo-image-picker");
    expect(imagePickerPlugin?.[1]?.photosPermission).toBe("Allow OneTapReality to access your selected photos to create albums.");
    expect(expo.plugins).toContainEqual(
      expect.arrayContaining([
        "expo-splash-screen",
        expect.objectContaining({ backgroundColor: "#F7F2EA" }),
      ]),
    );
  });
});
