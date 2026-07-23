import { fireEvent, render } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockIsReady = jest.fn();
const mockIsProfileReady = jest.fn();
const mockProfile = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({ memories: [], isReady: mockIsReady(), clearAllMemories: jest.fn() }),
}));
jest.mock("../src/features/profile/profile-provider", () => ({
  useProfile: () => ({ profile: mockProfile(), isProfileReady: mockIsProfileReady() }),
}));

import ProfileScreen from "../src/app/(tabs)/profile";

describe("ProfileScreen settings entry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsReady.mockReturnValue(true);
    mockIsProfileReady.mockReturnValue(true);
    mockProfile.mockReturnValue({ nickname: "小林", avatarUri: null });
  });

  it("routes to local profile settings from the profile card", async () => {
    const screen = await render(<ProfileScreen />);

    expect(screen.getByText("小林")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("打开设置"));

    expect(mockPush).toHaveBeenCalledWith("/settings");
  });

  it("waits for the local profile as well as memories before showing the archive", async () => {
    mockIsProfileReady.mockReturnValue(false);
    const screen = await render(<ProfileScreen />);

    expect(screen.queryByLabelText("打开设置")).toBeNull();
  });
});
