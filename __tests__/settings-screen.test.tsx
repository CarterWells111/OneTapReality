import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
const mockRequestPermission = jest.fn();
const mockLaunchImageLibrary = jest.fn();
const mockUpdateProfile = jest.fn();
const mockProfile = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) => mockRequestPermission(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibrary(...args),
}));
jest.mock("../src/features/profile/profile-provider", () => ({
  useProfile: () => ({ profile: mockProfile(), updateProfile: mockUpdateProfile }),
}));

import SettingsScreen from "../src/app/settings";

describe("SettingsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfile.mockReturnValue({ nickname: "旅忆用户", avatarUri: null });
    mockUpdateProfile.mockResolvedValue(undefined);
    mockRequestPermission.mockResolvedValue({ granted: true });
    mockLaunchImageLibrary.mockResolvedValue({ canceled: true, assets: null });
  });

  it("requests photo permission only after choosing an avatar", async () => {
    const screen = await render(<SettingsScreen />);

    expect(mockRequestPermission).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByText("选择头像"));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockRequestPermission).toHaveBeenCalledTimes(1);
      expect(mockLaunchImageLibrary).toHaveBeenCalledWith({
        allowsEditing: true,
        aspect: [1, 1],
        mediaTypes: ["images"],
        quality: 0.8,
      });
    });
  });

  it("shows the exact permission guidance when photo access is denied", async () => {
    mockRequestPermission.mockResolvedValue({ granted: false });
    const screen = await render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText("选择头像"));
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByText("未获得照片权限。你可以在系统设置中允许访问后再选择头像。")).toBeTruthy(),
    );
    expect(mockLaunchImageLibrary).not.toHaveBeenCalled();
  });

  it("saves a normalized nickname then returns to the profile page", async () => {
    const screen = await render(<SettingsScreen />);

    fireEvent.changeText(screen.getByLabelText("昵称"), "  小林  ");
    await waitFor(() => expect(screen.getByLabelText("昵称").props.value).toBe("  小林  "));
    await act(async () => {
      fireEvent.press(screen.getByText("保存资料"));
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(mockUpdateProfile).toHaveBeenCalledWith({ nickname: "小林", avatarUri: null }),
    );
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("prevents a second save while the first save is pending", async () => {
    let finishSave: () => void = () => undefined;
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockUpdateProfile.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const screen = await render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText("保存资料"));
      fireEvent.press(screen.getByText("保存资料"));
      await Promise.resolve();
    });

    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    await act(async () => finishSave());
    consoleError.mockRestore();
  });

  it("removes a selected avatar from the editing state", async () => {
    mockProfile.mockReturnValue({ nickname: "小林", avatarUri: "file://avatar.jpg" });
    const screen = await render(<SettingsScreen />);

    expect(screen.getByLabelText("小林的头像").props.source).toEqual({ uri: "file://avatar.jpg" });
    fireEvent.press(screen.getByText("移除头像"));

    await waitFor(() => expect(screen.getByLabelText("小林的头像").props.source).toBeUndefined());
    expect(screen.getByText("本机数据与隐私")).toBeTruthy();
  });
});
