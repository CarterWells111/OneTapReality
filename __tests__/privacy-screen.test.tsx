import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

const mockClearAllMemories = jest.fn();
const mockAlert = jest.spyOn(Alert, "alert");
const mockPush = jest.fn();
const mockSignOut = jest.fn();
const mockForgetRememberedEmail = jest.fn();
const mockUseAuth = jest.fn();
const mockUseLocalLibrary = jest.fn();
const mockRequestDeletionChallenge = jest.fn();
const mockDeleteAccount = jest.fn();
const mockDeleteAccountLibrary = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../src/features/auth/auth-provider", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../src/features/auth/privacy-local-library", () => ({ usePrivacyLocalLibrary: () => mockUseLocalLibrary() }));
jest.mock("../src/services/backend/api-client", () => ({
  ...jest.requireActual("../src/services/backend/api-client"),
  BackendApiClient: jest.fn().mockImplementation(() => ({
    deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
    requestAccountDeletionChallenge: (...args: unknown[]) => mockRequestDeletionChallenge(...args),
  })),
}));
jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({ clearAllMemories: mockClearAllMemories }),
}));

import PrivacyScreen from "../src/app/privacy";

describe("PrivacyScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      getSessionGeneration: () => 7,
      isAuthReady: true,
      forgetRememberedEmail: mockForgetRememberedEmail,
      sessionGeneration: 7,
      session: { accessToken: "session-token", user: { id: "user-1", email: "owner@example.com", isAdmin: false } },
      signOut: mockSignOut,
      user: { id: "user-1", email: "owner@example.com", isAdmin: false },
    });
    mockUseLocalLibrary.mockReturnValue({
      accountLibraryKey: "account:owner@example.com",
      currentLibraryIsGuest: false,
      deleteAccountLibrary: mockDeleteAccountLibrary,
      isLibraryReady: true,
    });
    mockClearAllMemories.mockResolvedValue(undefined);
    mockDeleteAccountLibrary.mockResolvedValue(undefined);
    mockSignOut.mockResolvedValue("applied");
    mockForgetRememberedEmail.mockResolvedValue("applied");
    mockRequestDeletionChallenge.mockResolvedValue({
      challengeId: "challenge-1",
      expiresAt: "2026-08-24T10:05:00.000Z",
    });
    mockDeleteAccount.mockResolvedValue({
      receiptId: "receipt-1",
      completeBy: "2026-08-25T10:00:00.000Z",
    });
  });

  it("explains local albums and explicit NFC gift publishing accurately", async () => {
    const screen = await render(<PrivacyScreen />);

    expect(screen.getByText("数据与隐私声明")).toBeTruthy();
    expect(screen.getByText(/本地旅行册默认保存在此设备/)).toBeTruthy();
    expect(screen.getByText(/不识别图像中的人物或具体内容/)).toBeTruthy();
    expect(screen.getByText(/主动发布共享版本时.*上传共享快照/)).toBeTruthy();
    expect(screen.getByText(/本地删除不会停用已发布的礼品/)).toBeTruthy();
  });

  it("explains shared album roles, activation, editing, and approval boundaries", async () => {
    const screen = await render(<PrivacyScreen />);

    expect(screen.getByText(/只读成员或可编辑成员.*随时切换/)).toBeTruthy();
    expect(screen.getByText(/受邀成员.*首次.*礼品激活.*完整相册预览/)).toBeTruthy();
    expect(screen.getByText(/可编辑成员.*页面编辑器.*新版本/)).toBeTruthy();
    expect(screen.getByText(/只修改云端共享快照.*本地原件/)).toBeTruthy();
    expect(screen.getByText(/整册删除、移除成员或修改权限.*礼品拥有者批准/)).toBeTruthy();
    expect(screen.getByText(/成员被移除、权限被撤销或礼品停用后.*立即拒绝/)).toBeTruthy();
    expect(screen.getByText(/不保存.*访问凭据.*不能证明.*实体.*碰卡/)).toBeTruthy();
  });

  it("distinguishes immediate access revocation from asynchronous media cleanup", async () => {
    const screen = await render(<PrivacyScreen />);

    expect(screen.getByText(/礼品拥有者或已激活的可编辑成员.*主动发布.*共享版本/)).toBeTruthy();
    expect(screen.getByText(/不会自动上传或修改.*本地原件/)).toBeTruthy();
    expect(screen.getByText(/访问和共享快照会立即撤销/)).toBeTruthy();
    expect(screen.getByText(/私有媒体.*后台安全删除.*失败.*重试/)).toBeTruthy();
    expect(screen.queryByText(/停用会删除.*共享快照和媒体/)).toBeNull();
  });

  it("confirms before deleting all local data", async () => {
    const screen = await render(<PrivacyScreen />);

    await fireEvent.press(screen.getByText("删除本机旅行册"));

    expect(mockAlert).toHaveBeenCalledWith(
      "删除本机旅行册？",
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ style: "destructive" })]),
    );
    expect(mockClearAllMemories).not.toHaveBeenCalled();

    const buttons = mockAlert.mock.calls[0][2] ?? [];
    const destructiveButton = buttons.find((button) => button.style === "destructive");
    await act(async () => {
      destructiveButton?.onPress?.();
      await Promise.resolve();
    });

    expect(mockClearAllMemories).toHaveBeenCalledTimes(1);
  });

  it("lets a signed-out guest delete only the active local library", async () => {
    mockUseAuth.mockReturnValue({
      forgetRememberedEmail: mockForgetRememberedEmail,
      getSessionGeneration: () => 0,
      isAuthReady: true,
      session: null,
      signOut: mockSignOut,
      user: null,
    });
    mockUseLocalLibrary.mockReturnValue({
      accountLibraryKey: null,
      currentLibraryIsGuest: true,
      deleteAccountLibrary: mockDeleteAccountLibrary,
      isLibraryReady: true,
    });
    const screen = render(<PrivacyScreen />);

    expect(screen.getByText("删除本机旅行册")).toBeTruthy();
    expect(screen.getByText(/当前为本机访客旅行册/)).toBeTruthy();
    fireEvent.press(screen.getByText("删除本机旅行册"));
    const buttons = mockAlert.mock.calls[0][2] ?? [];
    await act(async () => {
      buttons.find((button) => button.style === "destructive")?.onPress?.();
      await Promise.resolve();
    });

    expect(mockClearAllMemories).toHaveBeenCalledTimes(1);
    expect(screen.getByText("登录后可永久删除账号及云端数据")).toBeTruthy();
  });

  it("requires an emailed challenge and deletes the account library without touching guest data", async () => {
    const screen = render(<PrivacyScreen />);

    fireEvent.press(screen.getByText("永久删除账号及云端数据"));
    await waitFor(() => expect(mockRequestDeletionChallenge).toHaveBeenCalledWith("session-token"));
    expect(await screen.findByText(/验证码已发送至 owner@example.com/)).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText("账号删除验证码"), "123456");
    fireEvent.changeText(screen.getByLabelText("账号删除确认文字"), "DELETE");
    fireEvent.press(screen.getByText("确认永久删除"));

    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalledWith("session-token", {
      challengeId: "challenge-1",
      code: "123456",
      confirmation: "DELETE",
    }));
    expect(mockDeleteAccountLibrary).toHaveBeenCalledWith("account:owner@example.com");
    expect(mockForgetRememberedEmail).toHaveBeenCalledWith({
      accessToken: "session-token",
      email: "owner@example.com",
      generation: 7,
    });
    expect(mockSignOut).toHaveBeenCalledWith({
      accessToken: "session-token",
      email: "owner@example.com",
      generation: 7,
    });
    expect(mockSignOut.mock.invocationCallOrder[0]).toBeLessThan(
      mockDeleteAccountLibrary.mock.invocationCallOrder[0],
    );
    expect(mockClearAllMemories).not.toHaveBeenCalled();
    expect(mockAlert).toHaveBeenCalledWith(
      "账号删除已受理",
      expect.stringContaining("receipt-1"),
      expect.any(Array),
    );
  });

  it("does not direct a signed-out user to delete the guest library when account cleanup needs support", async () => {
    mockDeleteAccountLibrary.mockRejectedValue(new Error("local cleanup unavailable"));
    const screen = render(<PrivacyScreen />);

    fireEvent.press(screen.getByText("永久删除账号及云端数据"));
    await screen.findByText(/验证码已发送至 owner@example.com/);
    fireEvent.changeText(screen.getByLabelText("账号删除验证码"), "123456");
    fireEvent.changeText(screen.getByLabelText("账号删除确认文字"), "DELETE");
    fireEvent.press(screen.getByText("确认永久删除"));

    await waitFor(() => expect(mockAlert).toHaveBeenCalledWith(
      "账号删除已受理",
      expect.stringContaining("support@onetapreality.com"),
      expect.any(Array),
    ));
    const message = String(mockAlert.mock.calls.find(([title]) => title === "账号删除已受理")?.[1]);
    expect(message).not.toContain("重试删除本机旅行册");
    expect(mockDeleteAccountLibrary).toHaveBeenCalledTimes(2);
    expect(mockClearAllMemories).not.toHaveBeenCalled();
  });

  it("does not count scoped auth cleanup no-ops as successful device cleanup", async () => {
    mockSignOut.mockResolvedValue("no-op");
    mockForgetRememberedEmail.mockResolvedValue("no-op");
    const screen = render(<PrivacyScreen />);

    fireEvent.press(screen.getByText("永久删除账号及云端数据"));
    await screen.findByText(/验证码已发送至 owner@example.com/);
    fireEvent.changeText(screen.getByLabelText("账号删除验证码"), "123456");
    fireEvent.changeText(screen.getByLabelText("账号删除确认文字"), "DELETE");
    fireEvent.press(screen.getByText("确认永久删除"));

    await waitFor(() => expect(mockAlert).toHaveBeenCalledWith(
      "账号删除已受理",
      expect.stringContaining("support@onetapreality.com"),
      expect.any(Array),
    ));
  });

  it("releases account-deletion busy state after its own sign-out removes the session", async () => {
    let finishLibraryCleanup: (() => void) | undefined;
    mockDeleteAccountLibrary.mockReturnValue(new Promise<void>((resolve) => {
      finishLibraryCleanup = resolve;
    }));
    const screen = render(<PrivacyScreen />);

    fireEvent.press(screen.getByText("永久删除账号及云端数据"));
    await screen.findByText(/验证码已发送至 owner@example.com/);
    fireEvent.changeText(screen.getByLabelText("账号删除验证码"), "123456");
    fireEvent.changeText(screen.getByLabelText("账号删除确认文字"), "DELETE");
    fireEvent.press(screen.getByText("确认永久删除"));
    await waitFor(() => expect(mockDeleteAccountLibrary).toHaveBeenCalled());

    mockUseAuth.mockReturnValue({
      forgetRememberedEmail: mockForgetRememberedEmail,
      getSessionGeneration: () => 8,
      isAuthReady: true,
      sessionGeneration: 8,
      session: null,
      signOut: mockSignOut,
      user: null,
    });
    screen.rerender(<PrivacyScreen />);
    await act(async () => {
      finishLibraryCleanup?.();
      await Promise.resolve();
    });

    await waitFor(() => expect(mockAlert).toHaveBeenCalledWith(
      "账号删除已受理",
      expect.stringContaining("receipt-1"),
      expect.any(Array),
    ));
    expect(screen.getByRole("button", { name: "删除本机旅行册" })).toBeEnabled();
  });

  it("discards account A deletion UI and completion after switching to account B", async () => {
    let finishAccountDeletion: ((receipt: { receiptId: string; completeBy: string }) => void) | undefined;
    mockDeleteAccount.mockReturnValue(new Promise((resolve) => {
      finishAccountDeletion = resolve;
    }));
    const screen = render(<PrivacyScreen />);

    fireEvent.press(screen.getByText("永久删除账号及云端数据"));
    await screen.findByText(/验证码已发送至 owner@example.com/);
    fireEvent.changeText(screen.getByLabelText("账号删除验证码"), "123456");
    fireEvent.changeText(screen.getByLabelText("账号删除确认文字"), "DELETE");
    fireEvent.press(screen.getByText("确认永久删除"));
    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalled());

    mockUseAuth.mockReturnValue({
      forgetRememberedEmail: mockForgetRememberedEmail,
      getSessionGeneration: () => 9,
      isAuthReady: true,
      sessionGeneration: 9,
      session: { accessToken: "token-b", user: { id: "user-2", email: "b@example.com", isAdmin: false } },
      signOut: mockSignOut,
      user: { id: "user-2", email: "b@example.com", isAdmin: false },
    });
    screen.rerender(<PrivacyScreen />);
    await waitFor(() => expect(screen.queryByLabelText("账号删除验证码")).toBeNull());
    expect(screen.queryByText(/owner@example.com/)).toBeNull();

    await act(async () => {
      finishAccountDeletion?.({
        receiptId: "receipt-a",
        completeBy: "2026-08-25T10:00:00.000Z",
      });
      await Promise.resolve();
    });
    await waitFor(() => expect(mockDeleteAccountLibrary).toHaveBeenCalledWith("account:owner@example.com"));

    expect(screen.queryByText(/receipt-a/)).toBeNull();
    expect(mockAlert.mock.calls.some(([title]) => title === "账号删除已受理")).toBe(false);
    expect(screen.getByRole("button", { name: "永久删除账号及云端数据" })).toBeEnabled();
  });
});
