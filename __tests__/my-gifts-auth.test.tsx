import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSetParams = jest.fn();
const mockListOwnedGifts = jest.fn();
const mockListInvitedGifts = jest.fn();
const mockUseAuth = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockRouter = { push: mockPush, replace: mockReplace, setParams: mockSetParams };

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));
jest.mock("../src/features/auth/auth-provider", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../src/services/backend/api-client", () => ({
  BackendApiClient: jest.fn(() => ({ listOwnedGifts: mockListOwnedGifts, listInvitedGifts: mockListInvitedGifts })),
}));

import MyGiftsScreen from "../src/app/gifts/index";

describe("my gifts account gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListOwnedGifts.mockResolvedValue([]);
    mockListInvitedGifts.mockResolvedValue([]);
    mockUseLocalSearchParams.mockReturnValue({});
  });

  it("sends signed-out visitors to the global login screen", () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, session: null, signOut: jest.fn() });
    render(<MyGiftsScreen />);
    expect(screen.getByText("登录")).toBeTruthy();
  });

  it("uses the unified session to load owner gifts", async () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, session: { accessToken: "account-token", user: { id: "user-1", email: "owner@example.com", isAdmin: false } }, signOut: jest.fn() });
    render(<MyGiftsScreen />);
    await waitFor(() => expect(mockListOwnedGifts).toHaveBeenCalledWith("account-token"));
    await waitFor(() => expect(mockListInvitedGifts).toHaveBeenCalledWith("account-token"));
  });

  it("carries a selected local album into owner gift management", async () => {
    mockUseLocalSearchParams.mockReturnValue({ memoryId: "memory-1" });
    mockListOwnedGifts.mockResolvedValue([{ id: "gift-1", status: "bound", claimedAt: null, album: null }]);
    mockUseAuth.mockReturnValue({ isAuthReady: true, session: { accessToken: "account-token", user: { id: "owner-1", email: "owner@example.com", isAdmin: false } }, signOut: jest.fn() });
    render(<MyGiftsScreen />);
    await screen.findByText("管理");
    fireEvent.press(screen.getByText("管理"));
    expect(mockPush).toHaveBeenCalledWith("/gifts/gift-1?memoryId=memory-1");
  });

  it("shows invited album covers and auto-opens the cover page from an NFC open param", async () => {
    mockUseLocalSearchParams.mockReturnValue({ open: "gift-2" });
    mockListInvitedGifts.mockResolvedValue([
      { giftId: "gift-1", role: "viewer", album: { title: "杭州", albumId: "album-1", publishedAt: "2026-07-24T00:00:00.000Z", version: 1, cover: { readUrl: "https://cdn.test/cover.jpg", contentType: "image/jpeg", byteSize: 1 } } },
      { giftId: "gift-2", role: "viewer", album: { title: "上海", albumId: "album-2", publishedAt: "2026-07-24T00:00:00.000Z", version: 2, cover: null } },
    ]);
    mockUseAuth.mockReturnValue({ isAuthReady: true, session: { accessToken: "account-token", user: { id: "user-1", email: "viewer@example.com", isAdmin: false } }, signOut: jest.fn() });
    render(<MyGiftsScreen />);
    await waitFor(() => expect(screen.getByText("杭州")).toBeTruthy());
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/gifts/shared/gift-2"));
    expect(mockSetParams).toHaveBeenCalledWith({ open: undefined });
  });

  it("labels editor invitations as read-write access", async () => {
    mockListInvitedGifts.mockResolvedValue([
      { giftId: "gift-editor", role: "editor", album: { title: "Editor album", albumId: "album-editor", publishedAt: "2026-08-16T00:00:00.000Z", version: 1, cover: null } },
    ]);
    mockUseAuth.mockReturnValue({ isAuthReady: true, session: { accessToken: "editor-token", user: { id: "editor-1", email: "editor@example.com", isAdmin: false } }, signOut: jest.fn() });
    render(<MyGiftsScreen />);

    await screen.findByText("版本 1 · 读写访问");
    expect(screen.queryByText("版本 1 · 只读访问")).toBeNull();
  });

  it("never renders gifts from an old account after switching accounts", async () => {
    let resolveOldOwned!: (value: Array<{ id: string; status: string; claimedAt: null; album: null }>) => void;
    let resolveOldInvited!: (value: never[]) => void;
    mockListOwnedGifts.mockReturnValueOnce(new Promise((resolve) => { resolveOldOwned = resolve; })).mockResolvedValueOnce([
      { id: "gift-new", status: "bound", claimedAt: null, album: { title: "New account gift", albumId: "album-new", publishedAt: "2026-08-16T00:00:00.000Z", version: 1, cover: null } },
    ]);
    mockListInvitedGifts.mockReturnValueOnce(new Promise((resolve) => { resolveOldInvited = resolve; })).mockResolvedValueOnce([]);
    mockUseAuth.mockReturnValue({ isAuthReady: true, session: { accessToken: "old-token", user: { id: "old-user", email: "old@example.com", isAdmin: false } }, signOut: jest.fn() });
    const view = render(<MyGiftsScreen />);
    await waitFor(() => expect(mockListOwnedGifts).toHaveBeenCalledWith("old-token"));

    mockUseAuth.mockReturnValue({ isAuthReady: true, session: { accessToken: "new-token", user: { id: "new-user", email: "new@example.com", isAdmin: false } }, signOut: jest.fn() });
    view.rerender(<MyGiftsScreen />);
    await waitFor(() => expect(screen.getAllByText("New account gift").length).toBeGreaterThan(0));
    await act(async () => {
      resolveOldOwned([{ id: "gift-old", status: "bound", claimedAt: null, album: null }]);
      resolveOldInvited([]);
    });

    expect(screen.queryByText("我创建的礼物")).toBeNull();
    expect(screen.getAllByText("New account gift").length).toBeGreaterThan(0);
  });

  it("hides account gifts immediately on sign-out", async () => {
    mockListOwnedGifts.mockResolvedValue([{ id: "gift-old", status: "bound", claimedAt: null, album: { title: "Private gift", albumId: "album-old", publishedAt: "2026-08-16T00:00:00.000Z", version: 1, cover: null } }]);
    mockUseAuth.mockReturnValue({ isAuthReady: true, session: { accessToken: "old-token", user: { id: "old-user", email: "old@example.com", isAdmin: false } }, signOut: jest.fn() });
    const view = render(<MyGiftsScreen />);
    await waitFor(() => expect(screen.getAllByText("Private gift").length).toBeGreaterThan(0));

    mockUseAuth.mockReturnValue({ isAuthReady: true, session: null, signOut: jest.fn() });
    view.rerender(<MyGiftsScreen />);
    expect(screen.queryByText("Private gift")).toBeNull();
  });
});
