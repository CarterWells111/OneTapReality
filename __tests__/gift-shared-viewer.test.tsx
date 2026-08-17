import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockGetInvitedGiftAlbum = jest.fn();
const mockUseAuth = jest.fn();
const mockRouter = { back: mockBack, replace: mockReplace };
let mockParams = { id: "gift-1" };

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
}));
jest.mock("../src/features/auth/auth-provider", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../src/services/backend/api-client", () => ({
  BackendApiClient: jest.fn(() => ({ getInvitedGiftAlbum: mockGetInvitedGiftAlbum })),
}));
jest.mock("../src/features/canvas/page-reader", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return { PageReader: ({ pages }: { pages: unknown[] }) => <Text testID="reader">{`reader:${pages.length}`}</Text> };
});
jest.mock("../src/features/gifts/shared-album-editor", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return { SharedAlbumEditor: () => <Text testID="shared-editor">editor</Text> };
});

import SharedGiftDetailScreen from "../src/app/gifts/shared/[id]";

const album = {
  role: "viewer",
  title: "我们的杭州之旅",
  pages: [
    { position: 0, page: { id: "p0", position: 0, kind: "cover", headline: "杭州", body: "西湖边的记忆", layout: { aspectRatio: 0.75, elements: [{ id: "i0", type: "image", uri: "file:///local.jpg", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0 }] } } },
    { position: 1, page: { id: "p1", position: 1, kind: "photo", headline: "断桥", body: "小雪", layout: { aspectRatio: 0.75, elements: [] } } },
  ],
  media: [{ id: "m0", position: 0, contentType: "image/jpeg", byteSize: 10, readUrl: "https://cdn.test/photo.jpg" }],
  publishedAt: "2026-07-20T10:00:00.000Z",
  version: 1,
  cover: { readUrl: "https://cdn.test/cover.jpg", contentType: "image/jpeg", byteSize: 20 },
};

describe("shared gift album viewer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: "gift-1" };
    mockGetInvitedGiftAlbum.mockResolvedValue(album);
    mockUseAuth.mockReturnValue({ isAuthReady: true, session: { accessToken: "account-token", user: { id: "user-1", email: "viewer@example.com", isAdmin: false } }, signOut: jest.fn() });
  });

  it("starts on the album cover and opens the reader on demand", async () => {
    render(<SharedGiftDetailScreen />);
    await waitFor(() => expect(screen.getByText("我们的杭州之旅")).toBeTruthy());
    expect(screen.queryByTestId("reader")).toBeNull();

    fireEvent.press(screen.getByText("打开相册"));
    await waitFor(() => expect(screen.getByTestId("reader")).toBeTruthy());
  });

  it("does not offer editing to viewers", async () => {
    render(<SharedGiftDetailScreen />);
    await waitFor(() => expect(screen.getByText(album.title)).toBeTruthy());
    expect(screen.queryByText("编辑共享相册")).toBeNull();
  });

  it("lets editors enter the complete canvas editor", async () => {
    mockGetInvitedGiftAlbum.mockResolvedValueOnce({ ...album, role: "editor" });
    render(<SharedGiftDetailScreen />);
    await waitFor(() => expect(screen.getByText("编辑共享相册")).toBeTruthy());
    fireEvent.press(screen.getByText("编辑共享相册"));
    expect(screen.getByTestId("shared-editor")).toBeTruthy();
  });

  it("returns to the souvenir list from the cover", async () => {
    render(<SharedGiftDetailScreen />);
    await waitFor(() => expect(screen.getByText("返回纪念品")).toBeTruthy());
    fireEvent.press(screen.getByText("返回纪念品"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("clears the previous album while a different gift loads", async () => {
    const pending = new Promise(() => undefined);
    const view = render(<SharedGiftDetailScreen />);
    await waitFor(() => expect(screen.getByText(album.title)).toBeTruthy());
    mockParams = { id: "gift-2" };
    mockGetInvitedGiftAlbum.mockReturnValueOnce(pending);
    view.rerender(<SharedGiftDetailScreen />);
    await waitFor(() => expect(screen.queryByText(album.title)).toBeNull());
  });

  it("ignores an older request that resolves after a newer gift", async () => {
    let resolveOld!: (value: typeof album) => void;
    const oldRequest = new Promise<typeof album>((resolve) => { resolveOld = resolve; });
    mockGetInvitedGiftAlbum.mockReturnValueOnce(oldRequest);
    const view = render(<SharedGiftDetailScreen />);
    mockParams = { id: "gift-2" };
    const newerAlbum = { ...album, title: "Newer album" };
    mockGetInvitedGiftAlbum.mockResolvedValueOnce(newerAlbum);
    view.rerender(<SharedGiftDetailScreen />);
    await waitFor(() => expect(screen.getByText("Newer album")).toBeTruthy());
    resolveOld(album);
    await waitFor(() => expect(screen.queryByText(album.title)).toBeNull());
  });

  it("does not retain the previous album when the next load fails", async () => {
    const view = render(<SharedGiftDetailScreen />);
    await waitFor(() => expect(screen.getByText(album.title)).toBeTruthy());
    mockParams = { id: "gift-2" };
    mockGetInvitedGiftAlbum.mockRejectedValueOnce(new Error("offline"));
    view.rerender(<SharedGiftDetailScreen />);
    await waitFor(() => expect(screen.queryByText(album.title)).toBeNull());
  });

  it("preserves the encoded shared detail route when signing in", async () => {
    mockParams = { id: "gift/with space" };
    mockUseAuth.mockReturnValue({ isAuthReady: true, session: null });
    render(<SharedGiftDetailScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login?returnTo=%2Fgifts%2Fshared%2Fgift%252Fwith%2520space"));
  });
});
