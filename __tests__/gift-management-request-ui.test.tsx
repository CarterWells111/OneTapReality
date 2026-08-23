import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockGetAlbum = jest.fn();
const mockListTargets = jest.fn();
const mockCreateRequest = jest.fn();
let mockAuth = { isAuthReady: true, session: { accessToken: "token", user: { id: "editor-1", email: "editor@example.com" } } };
let mockParams = { id: "gift-1" };
const mockRouter = { back: jest.fn(), replace: jest.fn() };

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
}));
jest.mock("../src/features/auth/auth-provider", () => ({ useAuth: () => mockAuth }));
jest.mock("../src/services/backend/api-client", () => ({ BackendApiClient: jest.fn(() => ({ getInvitedGiftAlbum: mockGetAlbum, listInvitedGiftManagementTargets: mockListTargets, createInvitedGiftManagementRequest: mockCreateRequest })) }));
jest.mock("../src/features/canvas/page-reader", () => ({ PageReader: () => null }));
jest.mock("../src/features/gifts/shared-album-editor", () => ({ SharedAlbumEditor: () => null }));

import SharedGiftDetailScreen from "../src/app/gifts/shared/[id]";

const album = { role: "editor", title: "Trip", pages: [], media: [], publishedAt: "2026-08-16T00:00:00.000Z", version: 1, cover: null };

describe("gift management request UI", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: "gift-1" };
    mockAuth = { isAuthReady: true, session: { accessToken: "token", user: { id: "editor-1", email: "editor@example.com" } } };
    mockGetAlbum.mockResolvedValue(album);
    mockListTargets.mockResolvedValue([{ email: "viewer@example.com", role: "viewer" }, { email: "editor2@example.com", role: "editor" }]);
    mockCreateRequest.mockResolvedValue({ id: "request-1", status: "pending" });
  });

  it("lets an editor submit all three owner-approved management actions", async () => {
    render(<SharedGiftDetailScreen />);
    await screen.findByText("申请删除整册");
    expect(screen.getByLabelText("申请移除成员 viewer@example.com")).toBeTruthy();
    expect(screen.getByLabelText("申请将 viewer@example.com 改为读写")).toBeTruthy();
    fireEvent.press(screen.getByText("申请删除整册"));
    await waitFor(() => expect(mockCreateRequest).toHaveBeenCalledWith("gift-1", "token", { action: "delete_album" }));
    await waitFor(() => expect(screen.getByLabelText("申请移除成员 viewer@example.com").props.accessibilityState.disabled).toBe(false));
    fireEvent.press(screen.getByLabelText("申请移除成员 viewer@example.com"));
    await waitFor(() => expect(mockCreateRequest).toHaveBeenCalledWith("gift-1", "token", { action: "remove_member", targetEmail: "viewer@example.com" }));
    await waitFor(() => expect(screen.getByLabelText("申请将 viewer@example.com 改为读写").props.accessibilityState.disabled).toBe(false));
    fireEvent.press(screen.getByLabelText("申请将 viewer@example.com 改为读写"));
    await waitFor(() => expect(mockCreateRequest).toHaveBeenCalledWith("gift-1", "token", { action: "change_member_role", targetEmail: "viewer@example.com", targetRole: "editor" }));
  });

  it("retries an initial editor album load failure and restores management", async () => {
    mockGetAlbum.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(album);
    render(<SharedGiftDetailScreen />);
    await screen.findByText("无法读取此分享相册，请检查网络后重试。");
    fireEvent.press(screen.getByText("重试"));
    await screen.findByText("申请删除整册");
    expect(mockGetAlbum).toHaveBeenCalledTimes(2);
  });

  it("does not expose management actions to viewers", async () => {
    mockGetAlbum.mockResolvedValueOnce({ ...album, role: "viewer" });
    render(<SharedGiftDetailScreen />);
    await screen.findByText("打开相册");
    expect(screen.queryByText("申请删除整册")).toBeNull();
    expect(mockListTargets).not.toHaveBeenCalled();
  });

  it("uses a synchronous latch to suppress repeated management requests", async () => {
    let resolveRequest!: (value: unknown) => void;
    mockCreateRequest.mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve; }));
    render(<SharedGiftDetailScreen />);
    await screen.findByText("申请删除整册");
    act(() => {
      fireEvent.press(screen.getByText("申请删除整册"));
      fireEvent.press(screen.getByText("申请删除整册"));
    });
    expect(mockCreateRequest).toHaveBeenCalledTimes(1);
    await act(async () => { resolveRequest({ id: "request-1", status: "pending" }); await Promise.resolve(); });
  });

  it("hides stale targets immediately when the gift context changes", async () => {
    const view = render(<SharedGiftDetailScreen />);
    await screen.findByText("viewer@example.com");
    mockParams = { id: "gift-2" };
    mockAuth = { isAuthReady: true, session: { accessToken: "token-2", user: { id: "editor-2", email: "other@example.com" } } };
    mockGetAlbum.mockResolvedValueOnce({ ...album, role: "viewer", title: "Other" });
    view.rerender(<SharedGiftDetailScreen />);
    expect(screen.queryByText("viewer@example.com")).toBeNull();
    expect(screen.queryByText("申请删除整册")).toBeNull();
    await waitFor(() => expect(screen.getAllByText("Other").length).toBeGreaterThan(0));
  });
});
