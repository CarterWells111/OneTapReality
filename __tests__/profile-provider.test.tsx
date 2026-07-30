import {
  act,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react-native";
import * as React from "react";
import { Text } from "react-native";

const mockLoadLocalProfile = jest.fn();
const mockSaveLocalProfile = jest.fn();
let capturedUpdateProfile: ((profile: { nickname: string; avatarUri: string | null }) => Promise<void>) | undefined;

jest.mock("../src/features/profile/profile-storage", () => ({
  loadLocalProfile: (...args: unknown[]) => mockLoadLocalProfile(...args),
  saveLocalProfile: (...args: unknown[]) => mockSaveLocalProfile(...args),
}));

import { ProfileProvider, useProfile } from "../src/features/profile/profile-provider";

function ProfileConsumer() {
  const { profile, isProfileReady, updateProfile } = useProfile();

  return (
    <>
      <Text>{isProfileReady ? "已就绪" : "读取中"}</Text>
      <Text>{profile.nickname}</Text>
      <Text>{profile.avatarUri ?? "无头像"}</Text>
      <Text accessibilityRole="button" onPress={() => void updateProfile({ nickname: "  小林  ", avatarUri: "file://avatar.jpg" })}>
        更新资料
      </Text>
    </>
  );
}

function ProfileUpdateCapture() {
  capturedUpdateProfile = useProfile().updateProfile;
  return null;
}

class ProfileErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    return this.state.error ? <Text>{this.state.error.message}</Text> : this.props.children;
  }
}

describe("ProfileProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedUpdateProfile = undefined;
  });

  it("loads the local profile once before marking the profile ready", async () => {
    let resolveProfile: (profile: { nickname: string; avatarUri: null }) => void = () => undefined;
    mockLoadLocalProfile.mockReturnValue(
      new Promise((resolve) => {
        resolveProfile = resolve;
      }),
    );
    const screen = render(
      <ProfileProvider>
        <ProfileConsumer />
      </ProfileProvider>,
    );

    expect(screen.getByText("读取中")).toBeTruthy();

    await act(async () => resolveProfile({ nickname: "小林", avatarUri: null }));
    await waitFor(() => expect(screen.getByText("已就绪")).toBeTruthy());
    expect(screen.getByText("小林")).toBeTruthy();
    expect(mockLoadLocalProfile).toHaveBeenCalledTimes(1);
  });

  it("saves an update then exposes the persisted normalized profile", async () => {
    mockLoadLocalProfile
      .mockResolvedValueOnce({ nickname: "一触如初用户", avatarUri: null })
      .mockResolvedValueOnce({ nickname: "小林", avatarUri: "file://avatar.jpg" });
    mockSaveLocalProfile.mockResolvedValue(undefined);
    const screen = render(
      <ProfileProvider>
        <ProfileConsumer />
      </ProfileProvider>,
    );

    await waitFor(() => expect(screen.getByText("已就绪")).toBeTruthy());
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "更新资料" })));

    expect(mockSaveLocalProfile).toHaveBeenCalledWith({ nickname: "  小林  ", avatarUri: "file://avatar.jpg" });
    expect(screen.getByText("小林")).toBeTruthy();
    expect(mockLoadLocalProfile).toHaveBeenCalledTimes(2);
  });

  it("rejects an update when writing the local profile fails", async () => {
    mockLoadLocalProfile.mockResolvedValue({ nickname: "一触如初用户", avatarUri: null });
    mockSaveLocalProfile.mockRejectedValue(new Error("write failed"));
    render(
      <ProfileProvider>
        <ProfileUpdateCapture />
      </ProfileProvider>,
    );

    await waitFor(() => expect(capturedUpdateProfile).toBeDefined());
    await expect(capturedUpdateProfile!({ nickname: "小林", avatarUri: null })).rejects.toThrow("write failed");
  });

  it("throws when a consumer is rendered outside the provider", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const screen = await render(
      <ProfileErrorBoundary>
        <ProfileConsumer />
      </ProfileErrorBoundary>,
    );

    expect(screen.getByText("useProfile must be used inside ProfileProvider")).toBeTruthy();
    consoleError.mockRestore();
  });
});
