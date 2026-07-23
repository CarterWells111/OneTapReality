import { render } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockMemories = jest.fn();
const mockProfile = jest.fn();

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, [effect]),
  };
});
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
jest.mock("../src/features/commerce/shop/order-intent-store", () => ({
  listOrderIntents: () => Promise.resolve([]),
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
    expect(screen.getByText("选择照片，一触如初会用本地演示草稿帮你开启第一版旅行册。所有内容只留在这台设备。")).toBeTruthy();
  });

  it("keeps the OneTapReality slogan as the default profile bio", async () => {
    const screen = await render(<ProfileScreen />);

    expect(screen.getByText("让每一次触碰，都回到故事最初的地方。")).toBeTruthy();
  });

  it("keeps compatibility identifiers while updating app display configuration", () => {
    const expo = require("../app.json").expo;

    expect(expo.name).toBe("OneTapReality｜一触如初");
    expect(expo.slug).toBe("travel-memory-demo");
    expect(expo.scheme).toBe("lvyidemo");
    expect(expo.android.adaptiveIcon.backgroundColor).toBe("#F7F2EA");
    const imagePickerPlugin = expo.plugins.find((plugin: unknown) => Array.isArray(plugin) && plugin[0] === "expo-image-picker");
    expect(imagePickerPlugin?.[1]?.photosPermission).toBe("允许一触如初访问你选择的照片，以便制作旅行纪念册。");
    expect(expo.plugins).toContainEqual(
      expect.arrayContaining([
        "expo-splash-screen",
        expect.objectContaining({ backgroundColor: "#F7F2EA" }),
      ]),
    );
  });
});
