import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { InputAccessoryView, Keyboard, KeyboardAvoidingView, Platform } from "react-native";

const mockReplace = jest.fn();
const mockRequestCode = jest.fn();
const mockVerifyCode = jest.fn();
const mockUseAuth = jest.fn();
let mockReturnTo = "/gifts";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ returnTo: mockReturnTo }),
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock("../src/features/auth/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

import LoginScreen, { handleEmailSubmit } from "../src/app/login";

describe("LoginScreen account memory", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReturnTo = "/gifts";
    mockRequestCode.mockResolvedValue({ email: "owner@example.com" });
    mockVerifyCode.mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({
      isAuthReady: true,
      rememberedEmail: "owner@example.com",
      requestCode: mockRequestCode,
      verifyCode: mockVerifyCode,
    });
  });

  it("returns to the complete gift route after successful verification", async () => {
    const token = "Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE";
    mockReturnTo = `/gift/${token}`;
    const screen = render(<LoginScreen />);

    fireEvent.press(screen.getByText("发送验证码"));
    const codeInput = await screen.findByLabelText("登录验证码");
    fireEvent.changeText(codeInput, "123456");
    fireEvent.press(screen.getByText("验证并登录"));

    await waitFor(() => expect(mockVerifyCode).toHaveBeenCalledWith(
      "owner@example.com",
      "123456",
    ));
    expect(mockReplace).toHaveBeenCalledWith(`/gift/${token}`);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses iOS keyboard avoidance, interactive dismissal, and a code accessory", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const screen = render(<LoginScreen />);

    expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe("padding");
    expect(screen.getByTestId("login-scroll-view").props.keyboardShouldPersistTaps).toBe("handled");
    expect(screen.getByTestId("login-scroll-view").props.keyboardDismissMode).toBe("interactive");
    expect(screen.getByTestId("login-scroll-view").props.contentContainerStyle).toEqual(
      expect.objectContaining({ flexGrow: 1, justifyContent: "center" }),
    );

    fireEvent.press(screen.getByText("发送验证码"));
    const codeInput = await screen.findByLabelText("登录验证码");
    expect(codeInput.props.inputAccessoryViewID).toBe("login-code-accessory");
    expect(screen.UNSAFE_getByType(InputAccessoryView).props.nativeID).toBe("login-code-accessory");
  });

  it("uses Android keyboard avoidance and on-drag dismissal without an accessory", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const screen = render(<LoginScreen />);

    expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBeUndefined();
    expect(screen.getByTestId("login-scroll-view").props.keyboardDismissMode).toBe("on-drag");
    fireEvent.press(screen.getByText("发送验证码"));
    const codeInput = await screen.findByLabelText("登录验证码");
    expect(codeInput.props.inputAccessoryViewID).toBeUndefined();
    expect(screen.UNSAFE_queryByType(InputAccessoryView)).toBeNull();
    expect(screen.queryByText("完成")).toBeNull();
  });

  it("dismisses from blank background and card space while isolating controls", async () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => undefined);
    const screen = render(<LoginScreen />);
    const inputEvent = { stopPropagation: jest.fn() };
    const buttonEvent = { stopPropagation: jest.fn() };

    fireEvent(screen.getByTestId("login-email-control"), "touchEnd", inputEvent);
    fireEvent(screen.getByTestId("login-send-control"), "touchEnd", buttonEvent);
    expect(inputEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(buttonEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(dismiss).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("发送验证码"));
    await waitFor(() => expect(mockRequestCode).toHaveBeenCalledTimes(1));
    for (const testID of ["login-code-control", "login-verify-control", "login-resend-control"]) {
      const event = { stopPropagation: jest.fn() };
      fireEvent(screen.getByTestId(testID), "touchEnd", event);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    }
    expect(dismiss).not.toHaveBeenCalled();

    fireEvent(screen.getByTestId("login-background"), "touchEnd");
    fireEvent(screen.getByTestId("login-card"), "touchEnd", { stopPropagation: jest.fn() });
    expect(dismiss).toHaveBeenCalledTimes(2);
    expect(mockRequestCode).toHaveBeenCalledTimes(1);
  });

  it("dismisses from the email return key before a code is sent", () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => undefined);
    const screen = render(<LoginScreen />);

    expect(screen.getByLabelText("登录邮箱").props.returnKeyType).toBe("done");
    fireEvent(screen.getByLabelText("登录邮箱"), "submitEditing");

    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("uses the code field as the next keyboard target after a code is sent", async () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => undefined);
    const screen = render(<LoginScreen />);

    fireEvent.press(screen.getByText("发送验证码"));
    const codeInput = await screen.findByLabelText("登录验证码");
    expect(screen.getByLabelText("登录邮箱").props.returnKeyType).toBe("next");
    expect(codeInput.props.testID).toBe("login-code-input");
    fireEvent(screen.getByLabelText("登录邮箱"), "submitEditing");

    expect(dismiss).not.toHaveBeenCalled();
  });

  it("focuses the supplied code input through the production submit helper", () => {
    const focus = jest.fn();

    handleEmailSubmit(true, { focus });

    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("dismisses from the code return key without verifying", async () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => undefined);
    const screen = render(<LoginScreen />);

    fireEvent.press(screen.getByText("发送验证码"));
    const codeInput = await screen.findByLabelText("登录验证码");
    expect(codeInput.props.returnKeyType).toBe("done");
    fireEvent(codeInput, "submitEditing");

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(mockVerifyCode).not.toHaveBeenCalled();
  });

  it("dismisses from the iOS code keyboard accessory without verifying", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => undefined);
    const screen = render(<LoginScreen />);

    fireEvent.press(screen.getByText("发送验证码"));
    await screen.findByLabelText("登录验证码");
    fireEvent.press(screen.getByText("完成"));

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(mockVerifyCode).not.toHaveBeenCalled();
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
});
