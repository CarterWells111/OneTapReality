import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

const mockDismissTo = jest.fn();
const mockReplace = jest.fn();
const mockDispatch = jest.fn();
const mockGetInvitedGiftAlbum = jest.fn();
const mockGetOwnedGiftAlbum = jest.fn();
const mockUseAuth = jest.fn();
const mockSharedEditor = jest.fn();
let mockBeforeRemove: ((event: { preventDefault: () => void; data: { action: unknown } }) => void) | undefined;
let mockParams: { id: string; access?: string; pageId?: string; pageIndex?: string } = {
  id: "gift-1",
  pageId: "p1",
  pageIndex: "1",
};

const mockRouter = { dismissTo: mockDismissTo, replace: mockReplace };
const mockNavigation = {
  addListener: jest.fn((_event: string, listener: typeof mockBeforeRemove) => {
    mockBeforeRemove = listener;
    return jest.fn();
  }),
  dispatch: mockDispatch,
};

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
  useRouter: () => mockRouter,
}));
jest.mock("../src/features/auth/auth-provider", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../src/services/backend/api-client", () => ({
  BackendApiClient: jest.fn(() => ({
    getInvitedGiftAlbum: mockGetInvitedGiftAlbum,
    getOwnedGiftAlbum: mockGetOwnedGiftAlbum,
  })),
  BackendApiError: class BackendApiError extends Error {
    status: number;
    constructor(status: number) { super("backend error"); this.status = status; }
  },
}));
jest.mock("../src/features/gifts/shared-album-editor", () => {
  const React = require("react");
  const { Button, Text } = require("react-native");
  return {
    SharedAlbumEditor: (props: any) => {
      mockSharedEditor(props);
      return <>
        <Text testID="shared-editor">{`${props.album.role}:v${props.album.version}:${props.initialPageId}:${props.fallbackIndex}`}</Text>
        <Button title="mark dirty" onPress={() => props.onDirtyChange(true)} />
        <Button title="stage edits" onPress={() => props.onDirtyChange(true)} />
        <Button title="publish" onPress={() => void props.onPublished({ cursor: { pageId: "p2", index: 2 } })} />
        <Button title="clean exit" onPress={() => props.onExit({ pageId: "p1", index: 1 })} />
        <Button title="lose access" onPress={() => props.onAccessLost()} />
        <Button title="reload latest" onPress={() => void props.onReload({ pageId: "p1", index: 1 })} />
      </>;
    },
  };
});

import SharedGiftEditScreen from "../src/app/gifts/shared/[id]/edit";

const album = {
  role: "editor",
  title: "Trip",
  version: 1,
  publishedAt: "2026-08-16T00:00:00.000Z",
  cover: null,
  pages: [],
  media: [],
};

describe("shared gift edit route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBeforeRemove = undefined;
    mockParams = { id: "gift-1", pageId: "p1", pageIndex: "1" };
    mockUseAuth.mockReturnValue({
      isAuthReady: true,
      session: { accessToken: "token", user: { id: "editor-1", email: "editor@example.com" } },
    });
    mockGetInvitedGiftAlbum.mockResolvedValue(album);
    mockGetOwnedGiftAlbum.mockResolvedValue({ ...album, role: "owner" });
  });

  it("loads an editor snapshot into the complete shared canvas at the requested page", async () => {
    render(<SharedGiftEditScreen />);
    await waitFor(() => expect(screen.getByTestId("shared-editor")).toHaveTextContent("editor:v1:p1:1"));
    expect(mockGetInvitedGiftAlbum).toHaveBeenCalledWith("gift-1", "token");
    expect(mockGetOwnedGiftAlbum).not.toHaveBeenCalled();
  });

  it("uses the owned album API for owner access", async () => {
    mockParams = { ...mockParams, access: "owner" };
    render(<SharedGiftEditScreen />);
    await waitFor(() => expect(screen.getByTestId("shared-editor")).toHaveTextContent("owner:v1:p1:1"));
    expect(mockGetOwnedGiftAlbum).toHaveBeenCalledWith("gift-1", "token");
    expect(mockGetInvitedGiftAlbum).not.toHaveBeenCalled();
  });

  it("does not let a viewer enter the editor", async () => {
    mockGetInvitedGiftAlbum.mockResolvedValueOnce({ ...album, role: "viewer" });
    render(<SharedGiftEditScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/gifts"));
    expect(screen.queryByTestId("shared-editor")).toBeNull();
  });

  it("keeps the in-memory editor mounted and dirty after local staging", async () => {
    render(<SharedGiftEditScreen />);
    await screen.findByTestId("shared-editor");
    fireEvent.press(screen.getByText("stage edits"));
    expect(screen.getByTestId("shared-editor")).toHaveTextContent("editor:v1:p1:1");
    expect(mockGetInvitedGiftAlbum).toHaveBeenCalledTimes(1);
    const event = { preventDefault: jest.fn(), data: { action: { type: "GO_BACK" } } };
    act(() => mockBeforeRemove?.(event));
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it.each(["publish", "clean exit"])("returns to preview at the current page for %s", async (button) => {
    mockParams = { ...mockParams, access: "owner" };
    render(<SharedGiftEditScreen />);
    await screen.findByTestId("shared-editor");
    fireEvent.press(screen.getByText(button));
    const cursor = button === "publish" ? { pageId: "p2", pageIndex: "2" } : { pageId: "p1", pageIndex: "1" };
    expect(mockDismissTo).toHaveBeenCalledWith({
      pathname: "/gifts/shared/[id]",
      params: { access: "owner", id: "gift-1", ...cursor },
    });
  });

  it("confirms before discarding unpublished changes", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    render(<SharedGiftEditScreen />);
    await screen.findByTestId("shared-editor");
    fireEvent.press(screen.getByText("mark dirty"));
    const event = { preventDefault: jest.fn(), data: { action: { type: "GO_BACK" } } };
    act(() => mockBeforeRemove?.(event));
    expect(event.preventDefault).toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      "放弃未发布的修改？",
      expect.any(String),
      expect.any(Array),
    );
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    act(() => buttons.find((item) => item.text === "放弃修改")?.onPress?.());
    expect(mockDispatch).toHaveBeenCalledWith({ type: "GO_BACK" });
    alert.mockRestore();
  });

  it("returns to the gift list when editing access is revoked", async () => {
    render(<SharedGiftEditScreen />);
    await screen.findByTestId("shared-editor");
    fireEvent.press(screen.getByText("lose access"));
    expect(mockReplace).toHaveBeenCalledWith("/gifts");
  });

  it("keeps the in-memory editor and dirty guard when a latest-version reload fails", async () => {
    render(<SharedGiftEditScreen />);
    await screen.findByTestId("shared-editor");
    fireEvent.press(screen.getByText("mark dirty"));
    mockGetInvitedGiftAlbum.mockRejectedValueOnce(new Error("offline"));
    fireEvent.press(screen.getByText("reload latest"));
    await screen.findByText("无法读取共享相册最新版，请检查网络后重试。");
    expect(screen.getByTestId("shared-editor")).toHaveTextContent("editor:v1:p1:1");
    const event = { preventDefault: jest.fn(), data: { action: { type: "GO_BACK" } } };
    act(() => mockBeforeRemove?.(event));
    expect(event.preventDefault).toHaveBeenCalled();

    mockGetInvitedGiftAlbum.mockResolvedValueOnce({ ...album, version: 2 });
    fireEvent.press(screen.getByText("重试读取最新版"));
    await waitFor(() => expect(screen.getByTestId("shared-editor")).toHaveTextContent("editor:v2:p1:1"));
  });

  it("preserves owner access and page cursor through sign-in", async () => {
    mockParams = { id: "gift-1", access: "owner", pageId: "p1", pageIndex: "1" };
    mockUseAuth.mockReturnValue({ isAuthReady: true, session: null });
    render(<SharedGiftEditScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(
      "/login?returnTo=%2Fgifts%2Fshared%2Fgift-1%2Fedit%3Faccess%3Downer%26pageId%3Dp1%26pageIndex%3D1",
    ));
  });

  it("ignores editor callbacks captured by an older gift and account context", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const view = render(<SharedGiftEditScreen />);
    await screen.findByTestId("shared-editor");
    const oldProps = mockSharedEditor.mock.calls.at(-1)?.[0];

    mockParams = { id: "gift-2", pageId: "new-page", pageIndex: "0" };
    mockUseAuth.mockReturnValue({
      isAuthReady: true,
      session: { accessToken: "new-token", user: { id: "editor-2", email: "new@example.com" } },
    });
    mockGetInvitedGiftAlbum.mockResolvedValueOnce({ ...album, title: "New trip", version: 7 });
    view.rerender(<SharedGiftEditScreen />);
    await waitFor(() => expect(screen.getByTestId("shared-editor")).toHaveTextContent("editor:v7:new-page:0"));
    fireEvent.press(screen.getByText("mark dirty"));

    await act(async () => {
      oldProps.onDirtyChange(false);
      oldProps.onAccessLost();
      oldProps.onExit({ pageId: "old-page", index: 3 });
      await oldProps.onPublished({ cursor: { pageId: "old-page", index: 3 } });
    });

    expect(mockGetInvitedGiftAlbum).toHaveBeenCalledTimes(2);
    expect(mockGetInvitedGiftAlbum).toHaveBeenLastCalledWith("gift-2", "new-token");
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockDismissTo).not.toHaveBeenCalled();
    const event = { preventDefault: jest.fn(), data: { action: { type: "GO_BACK" } } };
    act(() => mockBeforeRemove?.(event));
    expect(event.preventDefault).toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith("放弃未发布的修改？", expect.any(String), expect.any(Array));
    alert.mockRestore();
  });
});
