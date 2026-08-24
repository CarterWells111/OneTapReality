import { fireEvent, render } from "@testing-library/react-native";
import { Alert } from "react-native";

const mockClearAllMemories = jest.fn();
const mockAlert = jest.spyOn(Alert, "alert");
const mockPush = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../src/features/auth/auth-provider", () => ({ useAuth: () => ({ isAuthReady: true, user: { email: "owner@example.com" } }) }));

jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({ clearAllMemories: mockClearAllMemories }),
}));

import PrivacyScreen from "../src/app/privacy";

describe("PrivacyScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    destructiveButton?.onPress?.();

    expect(mockClearAllMemories).toHaveBeenCalledTimes(1);
  });
});
