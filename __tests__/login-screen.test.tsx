import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
const mockRequestCode = jest.fn();
const mockVerifyCode = jest.fn();
const mockUseAuth = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ returnTo: "/gifts" }),
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock("../src/features/auth/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

import LoginScreen from "../src/app/login";

describe("LoginScreen account memory", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestCode.mockResolvedValue({ email: "owner@example.com" });
    mockVerifyCode.mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({
      isAuthReady: true,
      rememberedEmail: "owner@example.com",
      requestCode: mockRequestCode,
      verifyCode: mockVerifyCode,
    });
  });

  it("prefills the last successfully verified email without sending a code", () => {
    const screen = render(<LoginScreen />);

    expect(screen.getByLabelText("登录邮箱").props.value).toBe("owner@example.com");
    expect(mockRequestCode).not.toHaveBeenCalled();
  });

  it("allows the remembered email to be replaced before requesting a code", async () => {
    const screen = render(<LoginScreen />);
    fireEvent.changeText(screen.getByLabelText("登录邮箱"), "viewer@example.com");
    fireEvent.press(screen.getByText("发送验证码"));

    await waitFor(() => expect(mockRequestCode).toHaveBeenCalledWith("viewer@example.com"));
  });

  it("prefills when SecureStore hydration finishes after the screen mounts", () => {
    mockUseAuth.mockReturnValue({
      isAuthReady: true,
      rememberedEmail: null,
      requestCode: mockRequestCode,
      verifyCode: mockVerifyCode,
    });
    const screen = render(<LoginScreen />);
    expect(screen.getByLabelText("登录邮箱").props.value).toBe("");

    mockUseAuth.mockReturnValue({
      isAuthReady: true,
      rememberedEmail: "owner@example.com",
      requestCode: mockRequestCode,
      verifyCode: mockVerifyCode,
    });
    screen.rerender(<LoginScreen />);

    expect(screen.getByLabelText("登录邮箱").props.value).toBe("owner@example.com");
  });

  it("does not start a new login while the saved session is still hydrating", () => {
    mockUseAuth.mockReturnValue({
      isAuthReady: false,
      rememberedEmail: "owner@example.com",
      requestCode: mockRequestCode,
      verifyCode: mockVerifyCode,
    });
    const screen = render(<LoginScreen />);

    fireEvent.press(screen.getByText("正在读取账户…"));
    expect(mockRequestCode).not.toHaveBeenCalled();
  });

  it("explains a network failure with actionable local-dev guidance", async () => {
    mockRequestCode.mockRejectedValue(new Error("Network unavailable"));
    const screen = render(<LoginScreen />);

    fireEvent.press(screen.getByText("发送验证码"));

    await waitFor(() =>
      expect(screen.getByText("无法连接本地服务。请确认已启动开发服务器（npm run dev）后重试。")).toBeTruthy(),
    );
  });

  it("passes through server-provided error messages such as an invite-only gate", async () => {
    mockRequestCode.mockRejectedValue(new Error("This email is not invited to the Alpha"));
    const screen = render(<LoginScreen />);

    fireEvent.press(screen.getByText("发送验证码"));

    await waitFor(() =>
      expect(screen.getByText("This email is not invited to the Alpha")).toBeTruthy(),
    );
  });
});
