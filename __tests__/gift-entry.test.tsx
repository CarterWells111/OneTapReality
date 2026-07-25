import { render, screen, waitFor } from "@testing-library/react-native";

import { GiftEntry } from "../src/features/gifts/gift-entry";

jest.mock("../src/features/auth/auth-provider", () => ({
  useAuth: jest.fn(() => ({ isAuthReady: true, session: null })),
}));

jest.mock("../src/services/backend/api-client", () => ({
  BackendApiClient: class BackendApiClient {
    getGiftEntryStatus = jest.fn().mockResolvedValue({ status: "unclaimed" });
  },
  BackendApiError: class BackendApiError extends Error {},
}));

describe("gift NFC entry", () => {
  it("shows an install-only fallback on the web", () => {
    render(<GiftEntry token="gift-token" platform="web" />);
    expect(screen.getByText("请在 App 中打开礼品")).toBeTruthy();
  });

  it("sends a native visitor to unified login before claiming", async () => {
    render(<GiftEntry token="gift-token" platform="native" />);
    await waitFor(() => expect(screen.getByText("登录后认领礼品")).toBeTruthy());
  });
});
