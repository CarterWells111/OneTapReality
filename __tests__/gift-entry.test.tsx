import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { GiftEntry } from "../src/features/gifts/gift-entry";
import { BackendApiError } from "../src/services/backend/api-client";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockUseAuth = jest.fn();
const mockRouter = { push: mockPush, replace: mockReplace };
const mockClient = {
  getGiftEntryStatus: jest.fn(),
  getGiftAccess: jest.fn(),
  getGiftAlbum: jest.fn(),
  activateGiftViewer: jest.fn(),
  claimGift: jest.fn(),
};

jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));

jest.mock("../src/features/auth/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock("../src/services/backend/api-client", () => ({
  BackendApiClient: jest.fn(() => mockClient),
  BackendApiError: class BackendApiError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(status: number, code: string, message: string) {
      super(message);
      this.name = "BackendApiError";
      this.status = status;
      this.code = code;
    }
  },
}));

describe("gift NFC entry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthReady: true, session: null });
  });

  it("shows an install-only fallback on the web", () => {
    render(<GiftEntry token="gift-token" platform="web" />);
    expect(screen.getByText("请在 App 中打开礼品")).toBeTruthy();
  });

  it("sends a native visitor to unified login before claiming", async () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, session: null });
    mockClient.getGiftEntryStatus.mockResolvedValue({ status: "unclaimed" });
    render(<GiftEntry token="gift-token" platform="native" />);
    await waitFor(() => expect(screen.getByText("登录后绑定此纪念品")).toBeTruthy());
  });

  it("preserves a bound gift token while sending a signed-out invitee to login", async () => {
    const token = "Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE";
    mockClient.getGiftEntryStatus.mockResolvedValue({ status: "bound" });
    render(<GiftEntry token={token} platform="native" />);

    fireEvent.press(await screen.findByText("登录后查看此纪念品"));
    expect(mockPush).toHaveBeenCalledWith(
      `/login?returnTo=${encodeURIComponent(`/gift/${token}`)}`,
    );
  });

  it("shows an invalid-link message when the gift entry does not exist", async () => {
    mockClient.getGiftEntryStatus.mockRejectedValue(
      new BackendApiError(404, "gift_not_found", "Gift not found"),
    );

    render(<GiftEntry token="missing-gift" platform="native" />);

    await waitFor(() => expect(screen.getByText("此礼品链接无效。")).toBeTruthy());
  });

  it("shows a permission message when the signed-in account cannot access the gift", async () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, session: { accessToken: "account-token", user: { id: "user-1", email: "viewer@example.com", isAdmin: false } }, signOut: jest.fn() });
    mockClient.getGiftEntryStatus.mockResolvedValue({ status: "bound" });
    mockClient.getGiftAccess.mockRejectedValue(
      new BackendApiError(403, "gift_access_denied", "Gift access denied"),
    );

    render(<GiftEntry token="gift-token" platform="native" />);

    await waitFor(() => expect(screen.getByText("你没有访问此礼品的权限。")).toBeTruthy());
  });

  it("opens a published album directly after NFC activation", async () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, session: { accessToken: "account-token", user: { id: "user-1", email: "viewer@example.com", isAdmin: false } }, signOut: jest.fn() });
    mockClient.getGiftEntryStatus.mockResolvedValue({ status: "bound" });
    mockClient.getGiftAccess.mockResolvedValue({ id: "gift-1", status: "bound", role: "viewer", albumId: "album-1", albumTitle: "A shared trip", publishedAt: "2026-07-24T00:00:00.000Z", version: 1 });
    mockClient.activateGiftViewer.mockResolvedValue({ giftId: "gift-1", role: "viewer", albumPublished: true });
    render(<GiftEntry token="gift-token" platform="native" />);
    await waitFor(() => expect(mockClient.activateGiftViewer).toHaveBeenCalledWith("gift-token", "account-token"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/gifts/shared/gift-1"));
  });

  it("stays on the NFC status screen when the album is not published", async () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, session: { accessToken: "account-token", user: { id: "user-1", email: "viewer@example.com", isAdmin: false } }, signOut: jest.fn() });
    mockClient.getGiftEntryStatus.mockResolvedValue({ status: "bound" });
    mockClient.getGiftAccess.mockResolvedValue({ id: "gift-1", status: "bound", role: "viewer", albumId: null, albumTitle: null, publishedAt: null, version: null });
    mockClient.activateGiftViewer.mockResolvedValue({ giftId: "gift-1", role: "viewer", albumPublished: false });
    render(<GiftEntry token="gift-token" platform="native" />);
    await waitFor(() => expect(mockClient.activateGiftViewer).toHaveBeenCalled());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("encodes the activated gift id in the shared album route", async () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, session: { accessToken: "account-token", user: { id: "user-1", email: "viewer@example.com", isAdmin: false } }, signOut: jest.fn() });
    mockClient.getGiftEntryStatus.mockResolvedValue({ status: "bound" });
    mockClient.getGiftAccess.mockResolvedValue({ id: "gift-1", status: "bound", role: "viewer", albumId: "album-1", albumTitle: "Trip", publishedAt: "2026-08-16T00:00:00.000Z", version: 1 });
    mockClient.activateGiftViewer.mockResolvedValue({ giftId: "gift/with space", role: "viewer", albumPublished: true });
    render(<GiftEntry token="gift-token" platform="native" />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/gifts/shared/gift%2Fwith%20space"));
  });
});
