import { render, screen } from "@testing-library/react-native";

import { GiftEntry } from "../src/features/gifts/gift-entry";

jest.mock("../src/features/auth/auth-provider", () => ({
  useAuth: jest.fn(() => ({
    isAuthReady: true,
    session: null,
    requestCode: jest.fn(),
    verifyCode: jest.fn(),
  })),
}));

describe("gift NFC entry", () => {
  it("shows an install-only fallback on the web", () => {
    render(<GiftEntry token="gift-token" platform="web" />);

    expect(screen.getByText("请在 App 中打开礼品")).toBeTruthy();
    expect(screen.queryByText("验证邮箱后即可认领")).toBeNull();
  });

  it("asks a native visitor to verify their email before claiming", () => {
    render(<GiftEntry token="gift-token" platform="native" />);

    expect(screen.getByText("验证邮箱后即可认领")).toBeTruthy();
  });
});
