import { fireEvent, render, screen } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../src/config/build-environment", () => ({
  getBuildEnvironment: () => ({
    giftUrlOrigin: "https://staging.onetapreality.com",
  }),
}));

import { DevelopmentGiftLinkEntry } from "../src/features/gifts/development-gift-link-entry.development";

const TOKEN = "Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE";

describe("Development-only staging gift link entry", () => {
  beforeEach(() => mockPush.mockClear());

  it("opens a canonical staging gift through the normal gift route", () => {
    render(<DevelopmentGiftLinkEntry />);
    fireEvent.changeText(
      screen.getByPlaceholderText("https://staging.onetapreality.com/gift/…"),
      `https://staging.onetapreality.com/gift/${TOKEN}`,
    );
    fireEvent.press(screen.getByText("打开 staging 礼品"));
    expect(mockPush).toHaveBeenCalledWith(`/gift/${TOKEN}`);
  });

  it.each([
    `https://onetapreality.com/gift/${TOKEN}`,
    `https://staging.onetapreality.com/activate?token=${TOKEN}`,
  ])("rejects unsafe or cross-environment input without navigating", (value) => {
    render(<DevelopmentGiftLinkEntry />);
    fireEvent.changeText(
      screen.getByPlaceholderText("https://staging.onetapreality.com/gift/…"),
      value,
    );
    fireEvent.press(screen.getByText("打开 staging 礼品"));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText("链接不是当前 STAGING 环境的有效礼品链接。"))
      .toBeTruthy();
  });
});
