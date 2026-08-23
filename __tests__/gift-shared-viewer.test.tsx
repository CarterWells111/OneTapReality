import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockGetInvitedGiftAlbum = jest.fn();
const mockGetOwnedGiftAlbum = jest.fn();
const mockListTargets = jest.fn();
const mockUseAuth = jest.fn();
const mockPageReader = jest.fn();
const mockUseFocusEffect = jest.fn();
const mockRouter = { back: mockBack, push: mockPush, replace: mockReplace };
let mockParams: { id: string; access?: string; pageId?: string; pageIndex?: string } = { id: "gift-1" };

jest.mock("expo-router", () => ({
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) => options?.headerRight?.() ?? null,
  },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require("react");
    mockUseFocusEffect(callback);
    React.useEffect(callback, [callback]);
  },
  useRouter: () => mockRouter,
}));
jest.mock("../src/features/auth/auth-provider", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../src/services/backend/api-client", () => ({
  BackendApiClient: jest.fn(() => ({
    getInvitedGiftAlbum: mockGetInvitedGiftAlbum,
    getOwnedGiftAlbum: mockGetOwnedGiftAlbum,
    listInvitedGiftManagementTargets: mockListTargets,
  })),
}));
jest.mock("../src/features/canvas/page-reader", () => {
  const React = require("react");
  const { Button, Text } = require("react-native");
  return { PageReader: (props: { pages: unknown[]; initialPageId?: string; fallbackIndex?: number; onActivePageChange?: (cursor: { pageId: string; index: number }) => void }) => {
    mockPageReader(props);
    return <>
      <Text testID="reader">{`reader:${props.pages.length}`}</Text>
      <Button title="report second page" onPress={() => props.onActivePageChange?.({ pageId: "p1", index: 1 })} />
    </>;
  } };
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
    mockGetOwnedGiftAlbum.mockResolvedValue({ ...album, role: "owner" });
    mockListTargets.mockResolvedValue([]);
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
    expect(screen.queryByLabelText("编辑共享相册")).toBeNull();
  });

  it("opens editor albums directly and sends the current page to the dedicated edit route", async () => {
    mockGetInvitedGiftAlbum.mockResolvedValueOnce({ ...album, role: "editor" });
    render(<SharedGiftDetailScreen />);
    await waitFor(() => expect(screen.getByTestId("reader")).toBeTruthy());
    expect(screen.queryByText("打开相册")).toBeNull();
    fireEvent.press(screen.getByText("report second page"));
    fireEvent.press(screen.getByLabelText("编辑共享相册"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/gifts/shared/[id]/edit",
      params: { id: "gift-1", pageId: "p1", pageIndex: "1" },
    });
  });

  it("loads the owner snapshot directly and preserves owner access in the edit route", async () => {
    mockParams = { id: "gift-1", access: "owner" };
    render(<SharedGiftDetailScreen />);
    await waitFor(() => expect(mockGetOwnedGiftAlbum).toHaveBeenCalledWith("gift-1", "account-token"));
    expect(mockGetInvitedGiftAlbum).not.toHaveBeenCalled();
    expect(screen.getByTestId("reader")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("编辑共享相册"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/gifts/shared/[id]/edit",
      params: { access: "owner", id: "gift-1", pageId: "p0", pageIndex: "0" },
    });
  });

  it("restores a requested preview page and uses it for the edit route", async () => {
    mockParams = { id: "gift-1", pageId: "p1", pageIndex: "1" };
    mockGetInvitedGiftAlbum.mockResolvedValueOnce({ ...album, role: "editor" });
    render(<SharedGiftDetailScreen />);
    await waitFor(() => expect(screen.getByTestId("reader")).toBeTruthy());
    expect(mockPageReader).toHaveBeenLastCalledWith(expect.objectContaining({ fallbackIndex: 1, initialPageId: "p1" }));
    fireEvent.press(screen.getByLabelText("编辑共享相册"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/gifts/shared/[id]/edit",
      params: { id: "gift-1", pageId: "p1", pageIndex: "1" },
    });
  });

  it("reloads an editable preview when it regains focus after publishing", async () => {
    mockGetInvitedGiftAlbum.mockResolvedValueOnce({ ...album, role: "editor" });
    render(<SharedGiftDetailScreen />);
    await waitFor(() => expect(screen.getByTestId("reader")).toHaveTextContent("reader:2"));
    const latestAlbum = {
      ...album,
      role: "editor",
      version: 2,
      pages: [...album.pages, { ...album.pages[1], position: 2, page: { ...album.pages[1].page, id: "p2", position: 2 } }],
    };
    mockGetInvitedGiftAlbum.mockResolvedValueOnce(latestAlbum);
    const focusCallback = mockUseFocusEffect.mock.calls.at(-1)?.[0];
    act(() => { focusCallback(); });
    await waitFor(() => expect(screen.getByTestId("reader")).toHaveTextContent("reader:3"));
    expect(mockGetInvitedGiftAlbum).toHaveBeenCalledTimes(2);
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
