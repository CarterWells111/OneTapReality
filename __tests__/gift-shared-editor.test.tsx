import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as React from "react";

const mockStart = jest.fn();
const mockFinish = jest.fn();
const mockStartOwned = jest.fn();
const mockFinishOwned = jest.fn();
const mockPrepareSave = jest.fn();
const mockReleaseSaveLock = jest.fn();

jest.mock("../src/services/backend/api-client", () => ({
  BackendApiClient: jest.fn(() => ({
    startInvitedGiftPublish: mockStart,
    finishInvitedGiftPublish: mockFinish,
    startOwnedGiftPublish: mockStartOwned,
    finishOwnedGiftPublish: mockFinishOwned,
  })),
  BackendApiError: class BackendApiError extends Error {
    status: number;
    code: string;
    constructor(errorStatus: number, errorCode: string, message: string) { super(message); this.status = errorStatus; this.code = errorCode; }
  },
}));
jest.mock("../src/features/canvas/book-canvas-editor", () => {
  const React = require("react");
  const { Button, Text } = require("react-native");
  return { BookCanvasEditor: React.forwardRef(({ fallbackIndex, initialPageId, pages, onActivePageChange, onPagesChange, onTransformPendingChange }: any, ref: any) => {
    const cursor = React.useRef({ pageId: initialPageId ?? pages[0]?.id ?? "", index: fallbackIndex ?? 0 });
    React.useImperativeHandle(ref, () => ({
      prepareSave: () => mockPrepareSave(pages, cursor.current),
      releaseSaveLock: mockReleaseSaveLock,
    }), [pages]);
    return <>
      <Text testID="canvas-entry">{`${initialPageId ?? ""}:${fallbackIndex ?? 0}`}</Text>
      <Text testID="canvas-pages">{JSON.stringify(pages)}</Text>
      <Button title="report second page" onPress={() => {
        cursor.current = { pageId: "p2", index: 1 };
        onActivePageChange?.(cursor.current);
      }} />
      <Button title="change text" onPress={() => onPagesChange([{ ...pages[0], headline: "Changed" }, ...pages.slice(1)], "text")} />
      <Button title="restore text" onPress={() => onPagesChange([{ ...pages[0], headline: "Hello" }, ...pages.slice(1)], "text")} />
      <Button title="begin transform" onPress={() => onTransformPendingChange?.(true)} />
      <Button title="end transform" onPress={() => onTransformPendingChange?.(false)} />
      <Button title="add local photo" onPress={() => onPagesChange([...pages, { ...pages[0], id: "new-page", position: 1, photoUri: "file:///new.jpg" }], "structure")} />
      <Button title="set local page cover" onPress={() => onPagesChange([{ ...pages[0], layout: { aspectRatio: 0.75, elements: [], coverImage: "file:///new.jpg" } }], "structure")} />
      <Button title="set local top cover" onPress={() => onPagesChange([{ ...pages[0], coverImage: "file:///new.jpg" }], "structure")} />
      <Button title="add two local photos" onPress={() => onPagesChange([
        { ...pages[0], id: "new-a", photoUri: "file:///a.jpg" },
        { ...pages[0], id: "new-b", position: 1, photoUri: "file:///b.jpg" },
      ], "structure")} />
    </>;
  }) };
});

import { SharedAlbumEditor } from "../src/features/gifts/shared-album-editor";
import { AlbumMetadataEditor } from "../src/features/memories/album-metadata-editor";

const album: any = {
  role: "editor", title: "Trip", travelDate: "2026-08-16", version: 4, publishedAt: "2026-08-16T00:00:00Z", cover: null,
  pages: [{ position: 0, page: { id: "p0", position: 0, kind: "photo", headline: "Hello", body: "", photoSlot: 0 } }],
  media: [{ id: "media-1", position: 0, contentType: "image/jpeg", byteSize: 12, readUrl: "https://signed.test/old.jpg" }],
};

describe("SharedAlbumEditor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrepareSave.mockImplementation(async (pages, cursor) => ({ pages, cursor }));
    mockStart.mockResolvedValue({ publicationId: "pub-1", uploads: [{ position: 1, uploadUrl: "https://upload.test/new", objectKey: "server-key" }], coverUpload: null });
    mockFinish.mockResolvedValue({ albumId: "album-1" });
    mockStartOwned.mockResolvedValue({ publicationId: "owned-pub", uploads: [], coverUpload: null });
    mockFinishOwned.mockResolvedValue({ albumId: "album-1" });
    global.fetch = jest.fn(async (url: any) => url === "file:///new.jpg"
      ? ({ ok: true, blob: async () => new Blob(["new"], { type: "image/jpeg" }) })
      : ({ ok: true })) as any;
  });

  it("submits existing and new media without persisting signed read URLs", async () => {
    const onPublished = jest.fn();
    render(<SharedAlbumEditor accessToken="token" album={album} giftId="gift-1" onAccessLost={jest.fn()} onPublished={onPublished} />);
    fireEvent.press(screen.getByText("add local photo"));
    fireEvent.press(screen.getByText("report second page"));
    fireEvent.press(screen.getByText("保存并发布更新"));

    await waitFor(() => expect(mockFinish).toHaveBeenCalledWith("gift-1", "token", "pub-1"));
    const payload = mockStart.mock.calls[0][2];
    expect(payload.baseVersion).toBe(4);
    expect(payload.title).toBe("Trip");
    expect(payload.travelDate).toBe("2026-08-16");
    expect(payload.media).toEqual([
      { position: 0, mediaId: "media-1" },
      { position: 1, contentType: "image/jpeg", byteSize: 3 },
    ]);
    expect(JSON.stringify(payload.pages)).not.toContain("https://signed.test");
    expect(global.fetch).toHaveBeenCalledWith("https://upload.test/new", expect.objectContaining({ method: "PUT" }));
    expect(onPublished).toHaveBeenCalledWith({ cursor: { pageId: "p2", index: 1 } });
  });

  it("uses the owner publication API while keeping the same canvas editor payload", async () => {
    const ownedAlbum = { ...album, role: "owner" };
    const view = render(<SharedAlbumEditor accessToken="token" album={ownedAlbum} giftId="gift-1" onAccessLost={jest.fn()} onPublished={jest.fn()} />);
    fireEvent.press(screen.getByText("change text"));
    fireEvent(screen.getByLabelText("双击修改旅行册名称"), "accessibilityAction", { nativeEvent: { actionName: "activate" } });
    fireEvent.changeText(screen.getByLabelText("纪念册标题"), "  Owner's latest trip  ");
    actMetadataChange(view, { travelDate: "2026-08-18" });
    expect(view.UNSAFE_getByType(AlbumMetadataEditor).props).toEqual(expect.objectContaining({
      title: "  Owner's latest trip  ",
      travelDate: "2026-08-18",
    }));
    fireEvent.press(screen.getByText("保存并发布更新"));
    await waitFor(() => expect(mockFinishOwned).toHaveBeenCalledWith("token", "gift-1", "owned-pub"));
    expect(mockStartOwned).toHaveBeenCalledTimes(1);
    expect(mockStartOwned).toHaveBeenCalledWith("token", "gift-1", expect.objectContaining({
      baseVersion: 4,
      title: "Owner's latest trip",
      travelDate: "2026-08-18",
      media: [{ position: 0, mediaId: "media-1" }],
    }));
    expect(mockFinishOwned).toHaveBeenCalledTimes(1);
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockFinish).not.toHaveBeenCalled();
  });

  it("encodes existing and new layout cover images as reloadable stable media refs", async () => {
    const existingCoverAlbum = {
      ...album,
      pages: [{ position: 0, page: { id: "p0", position: 0, kind: "cover", headline: "", body: "", layout: { aspectRatio: 0.75, elements: [], coverImage: "shared-media:media-1" } } }],
    };
    mockStart.mockResolvedValueOnce({ publicationId: "pub-existing", uploads: [], coverUpload: null });
    const firstView = render(<SharedAlbumEditor accessToken="token" album={existingCoverAlbum} giftId="gift-1" onAccessLost={jest.fn()} onPublished={jest.fn()} />);
    expect(screen.getByTestId("canvas-pages").props.children).toContain("https://signed.test/old.jpg");
    fireEvent.press(screen.getByText("change text"));
    fireEvent.press(screen.getByText("保存并发布更新"));
    await waitFor(() => expect(mockFinish).toHaveBeenCalled());
    let payload = mockStart.mock.calls[0][2];
    expect(payload.media).toEqual([{ position: 0, mediaId: "media-1" }]);
    expect(payload.pages[0].page.layout.coverImage).toBe("shared-media:media-1");
    expect(JSON.stringify(payload.pages)).not.toContain("https://signed.test");
    firstView.unmount();

    jest.clearAllMocks();
    mockStart.mockResolvedValueOnce({ publicationId: "pub-new", uploads: [{ position: 0, uploadUrl: "https://upload.test/new" }], coverUpload: null });
    mockFinish.mockResolvedValueOnce({ albumId: "album-1" });
    render(<SharedAlbumEditor accessToken="token" album={{ ...album, media: [], pages: [{ ...album.pages[0], page: { ...album.pages[0].page, photoSlot: undefined } }] }} giftId="gift-1" onAccessLost={jest.fn()} onPublished={jest.fn()} />);
    fireEvent.press(screen.getByText("set local page cover"));
    fireEvent.press(screen.getByText("保存并发布更新"));
    await waitFor(() => expect(mockFinish).toHaveBeenCalled());
    payload = mockStart.mock.calls[0][2];
    expect(payload.pages[0].page.layout.coverImage).toBe("shared-position:0");
    expect(JSON.stringify(payload.pages)).not.toContain("file:///new.jpg");
  });

  it("encodes a top-level page cover as a stable media reference", async () => {
    const noMediaAlbum = { ...album, media: [], pages: [{ ...album.pages[0], page: { ...album.pages[0].page, photoSlot: undefined } }] };
    mockStart.mockResolvedValueOnce({ publicationId: "pub-cover", uploads: [{ position: 0, uploadUrl: "https://upload.test/cover" }], coverUpload: null });
    render(<SharedAlbumEditor accessToken="token" album={noMediaAlbum} giftId="gift-1" onAccessLost={jest.fn()} onPublished={jest.fn()} />);
    fireEvent.press(screen.getByText("set local top cover"));
    fireEvent.press(screen.getByText("保存并发布更新"));
    await waitFor(() => expect(mockFinish).toHaveBeenCalled());
    const payload = mockStart.mock.calls[0][2];
    expect(payload.pages[0].page.coverImage).toBe("shared-position:0");
    expect(JSON.stringify(payload.pages)).not.toContain("file:///new.jpg");
  });

  it("re-fetches new blobs one at a time for upload and stops after a failed PUT", async () => {
    let releaseFirstPut!: () => void;
    const firstPut = new Promise<void>((resolve) => { releaseFirstPut = resolve; });
    const reads = new Map<string, number>();
    global.fetch = jest.fn(async (url: any, options?: any) => {
      if (url === "file:///a.jpg" || url === "file:///b.jpg") {
        reads.set(url, (reads.get(url) ?? 0) + 1);
        return { ok: true, blob: async () => new Blob([url.endsWith("a.jpg") ? "aa" : "bbb"], { type: "image/jpeg" }) };
      }
      if (url === "https://upload.test/a") { await firstPut; return { ok: false }; }
      return { ok: true };
    }) as any;
    mockStart.mockResolvedValueOnce({ publicationId: "pub-two", uploads: [
      { position: 0, uploadUrl: "https://upload.test/a" }, { position: 1, uploadUrl: "https://upload.test/b" },
    ], coverUpload: null });
    const onPublished = jest.fn();
    render(<SharedAlbumEditor accessToken="token" album={{ ...album, media: [] }} giftId="gift-1" onAccessLost={jest.fn()} onPublished={onPublished} />);
    fireEvent.press(screen.getByText("add two local photos"));
    fireEvent.press(screen.getByText("保存并发布更新"));
    await waitFor(() => expect(reads.get("file:///a.jpg")).toBe(2));
    expect(reads.get("file:///b.jpg")).toBe(1);
    releaseFirstPut();
    await waitFor(() => expect(screen.getByText("照片上传失败。")).toBeTruthy());
    expect(reads.get("file:///b.jpg")).toBe(1);
    expect(mockFinish).not.toHaveBeenCalled();
    expect(onPublished).not.toHaveBeenCalled();
  });

  it("locks stale state after a version conflict and reloads", async () => {
    const { BackendApiError } = require("../src/services/backend/api-client");
    mockStart.mockRejectedValueOnce(new BackendApiError(409, "gift_album_version_conflict", "stale"));
    const onPublished = jest.fn();
    const onReload = jest.fn();
    render(<SharedAlbumEditor accessToken="token" album={album} giftId="gift-1" onAccessLost={jest.fn()} onPublished={onPublished} onReload={onReload} />);
    fireEvent.press(screen.getByText("change text"));
    fireEvent.press(screen.getByText("report second page"));
    fireEvent.press(screen.getByText("保存并发布更新"));
    await waitFor(() => expect(screen.getByText("相册已有新版本，请重新加载后再编辑。" )).toBeTruthy());
    fireEvent.press(screen.getByText("保存并发布更新"));
    expect(mockStart).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByText("重新加载最新版"));
    expect(onPublished).not.toHaveBeenCalled();
    expect(onReload).toHaveBeenCalledWith({ pageId: "p2", index: 1 });
  });

  it("clears the complete editor when access is revoked and prevents duplicate submits", async () => {
    const { BackendApiError } = require("../src/services/backend/api-client");
    let reject!: (error: Error) => void;
    mockStart.mockReturnValueOnce(new Promise((_resolve, nextReject) => { reject = nextReject; }));
    const onAccessLost = jest.fn(() => {
      expect(screen.queryByTestId("saved-memory-metadata-header")).toBeNull();
      expect(screen.queryByTestId("canvas-pages")).toBeNull();
    });
    const onDirtyChange = jest.fn();
    const view = render(<SharedAlbumEditor accessToken="token" album={album} giftId="gift-1" onAccessLost={onAccessLost} onDirtyChange={onDirtyChange} onPublished={jest.fn()} />);
    fireEvent.press(screen.getByText("change text"));
    actMetadataChange(view, { title: "Revoked draft", travelDate: "2026-08-20" });
    fireEvent.press(screen.getByText("保存并发布更新"));
    fireEvent.press(screen.getByText("正在发布…"));
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
    reject(new BackendApiError(403, "gift_editor_required", "revoked"));
    await waitFor(() => expect(onAccessLost).toHaveBeenCalled());
    expect(screen.queryByTestId("saved-memory-metadata-header")).toBeNull();
    expect(screen.queryByTestId("canvas-pages")).toBeNull();
    expect(screen.queryByText("暂存当前修改")).toBeNull();
    expect(screen.queryByText("保存并发布更新")).toBeNull();
    expect(screen.queryByText("Revoked draft")).toBeNull();
    expect(screen.queryByText("2026-08-20")).toBeNull();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("stops a pending publication after unmount without finishing or publishing callbacks", async () => {
    let resolveStart!: (publication: { publicationId: string; uploads: never[]; coverUpload: null }) => void;
    mockStart.mockReturnValueOnce(new Promise((resolve) => { resolveStart = resolve; }));
    const onPublished = jest.fn();
    const onAccessLost = jest.fn();
    const onPublishBusyChange = jest.fn();
    const view = render(<SharedAlbumEditor accessToken="token" album={album} giftId="gift-1" onAccessLost={onAccessLost} onPublishBusyChange={onPublishBusyChange} onPublished={onPublished} />);
    fireEvent.press(screen.getByText("change text"));
    fireEvent.press(screen.getByText("保存并发布更新"));
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
    expect(onPublishBusyChange).toHaveBeenLastCalledWith(true);
    view.unmount();
    await act(async () => resolveStart({ publicationId: "late-publication", uploads: [], coverUpload: null }));
    expect(mockFinish).not.toHaveBeenCalled();
    expect(onPublished).not.toHaveBeenCalled();
    expect(onAccessLost).not.toHaveBeenCalled();
    expect(mockReleaseSaveLock).toHaveBeenCalled();
  });

  it("keeps stage operations current through StrictMode effect replay", async () => {
    render(
      <React.StrictMode>
        <SharedAlbumEditor accessToken="token" album={album} giftId="gift-1" onAccessLost={jest.fn()} onPublished={jest.fn()} />
      </React.StrictMode>,
    );
    fireEvent.press(screen.getByText("change text"));
    fireEvent.press(screen.getByText("暂存当前修改"));
    await screen.findByText("修改已暂存在当前编辑会话，尚未发布。");
    expect(mockPrepareSave).toHaveBeenCalledTimes(1);
  });

  it("publishes the Canvas editor's settled save snapshot instead of stale parent pages", async () => {
    mockStart.mockResolvedValueOnce({ publicationId: "pub-prepared", uploads: [], coverUpload: null });
    mockPrepareSave.mockImplementationOnce(async (pages, cursor) => ({
      cursor,
      pages: [{ ...pages[0], headline: "Prepared latest" }, ...pages.slice(1)],
    }));
    render(<SharedAlbumEditor accessToken="token" album={album} giftId="gift-1" onAccessLost={jest.fn()} onPublished={jest.fn()} />);

    fireEvent.press(screen.getByText("change text"));
    fireEvent.press(screen.getByText("保存并发布更新"));

    await waitFor(() => expect(mockFinish).toHaveBeenCalled());
    expect(mockPrepareSave).toHaveBeenCalledTimes(1);
    expect(mockStart.mock.calls[0][2].pages[0].page.headline).toBe("Prepared latest");
    expect(mockReleaseSaveLock).toHaveBeenCalled();
  });

  it("publishes an open Canvas style draft before the parent dirty state changes", async () => {
    mockStart.mockResolvedValueOnce({ publicationId: "pub-open-draft", uploads: [], coverUpload: null });
    mockPrepareSave.mockImplementationOnce(async (pages, cursor) => ({
      cursor,
      pages: [{ ...pages[0], headline: "Open style draft" }, ...pages.slice(1)],
    }));
    render(<SharedAlbumEditor accessToken="token" album={album} giftId="gift-1" onAccessLost={jest.fn()} onPublished={jest.fn()} />);

    expect(screen.getByRole("button", { name: "保存并发布更新" }).props.accessibilityState.disabled).toBe(false);
    fireEvent.press(screen.getByText("保存并发布更新"));

    await waitFor(() => expect(mockFinish).toHaveBeenCalled());
    expect(mockStart.mock.calls[0][2].pages[0].page.headline).toBe("Open style draft");
  });

  it("retains a prepared Canvas draft as dirty when publication fails so retry can publish it", async () => {
    mockStart
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce({ publicationId: "pub-retry-draft", uploads: [], coverUpload: null });
    mockPrepareSave.mockImplementationOnce(async (pages, cursor) => ({
      cursor,
      pages: [{ ...pages[0], headline: "Retry this draft" }, ...pages.slice(1)],
    }));
    render(<SharedAlbumEditor accessToken="token" album={album} giftId="gift-1" onAccessLost={jest.fn()} onPublished={jest.fn()} />);

    fireEvent.press(screen.getByText("保存并发布更新"));
    await waitFor(() => expect(screen.getByText("temporary network failure")).toBeTruthy());
    fireEvent.press(screen.getByText("保存并发布更新"));

    await waitFor(() => expect(mockFinish).toHaveBeenCalledWith("gift-1", "token", "pub-retry-draft"));
    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(mockStart.mock.calls[1][2].pages[0].page.headline).toBe("Retry this draft");
  });

  it("opens the complete canvas at the requested page and blocks both saves during transforms", () => {
    render(<SharedAlbumEditor accessToken="token" album={album} fallbackIndex={1} giftId="gift-1" initialPageId="p2" onAccessLost={jest.fn()} onPublished={jest.fn()} />);
    expect(screen.getByTestId("canvas-entry")).toHaveTextContent("p2:1");
    fireEvent.press(screen.getByText("change text"));
    fireEvent.press(screen.getByText("begin transform"));
    expect(screen.getByRole("button", { name: "暂存当前修改" }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole("button", { name: "保存并发布更新" }).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByText("暂存当前修改"));
    expect(mockStart).not.toHaveBeenCalled();
  });

  it.each(["editor", "owner"] as const)("returns without publishing when a %s album has no changes", async (role) => {
    const onExit = jest.fn();
    const onPublished = jest.fn();
    const onDirtyChange = jest.fn();
    render(<SharedAlbumEditor accessToken="token" album={{ ...album, role }} giftId="gift-1" onAccessLost={jest.fn()} onDirtyChange={onDirtyChange} onExit={onExit} onPublished={onPublished} />);
    fireEvent.press(screen.getByText("report second page"));
    fireEvent.press(screen.getByText("保存并发布更新"));
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
    expect(onExit).toHaveBeenCalledWith({ pageId: "p2", index: 1 });
    expect(onPublished).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockFinish).not.toHaveBeenCalled();
    expect(mockStartOwned).not.toHaveBeenCalled();
    expect(mockFinishOwned).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(onDirtyChange).not.toHaveBeenCalled();
  });

  it("treats normalized metadata matching the published baseline as unchanged", async () => {
    const onDirtyChange = jest.fn();
    const onExit = jest.fn();
    const onPublished = jest.fn();
    const view = render(<SharedAlbumEditor accessToken="token" album={album} giftId="gift-1" onAccessLost={jest.fn()} onDirtyChange={onDirtyChange} onExit={onExit} onPublished={onPublished} />);
    actMetadataChange(view, { title: "  Trip  " });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    actMetadataChange(view, { travelDate: "2026-08-16" });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    fireEvent.press(screen.getByText("保存并发布更新"));
    await waitFor(() => expect(onExit).toHaveBeenCalledWith({ pageId: "p0", index: 0 }));
    expect(onPublished).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockStartOwned).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns dirty to false after title and Canvas edits are restored to the baseline", () => {
    const onDirtyChange = jest.fn();
    const view = render(<SharedAlbumEditor accessToken="token" album={album} giftId="gift-1" onAccessLost={jest.fn()} onDirtyChange={onDirtyChange} onPublished={jest.fn()} />);
    actMetadataChange(view, { title: "Different" });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    actMetadataChange(view, { title: "Trip" });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    fireEvent.press(screen.getByText("change text"));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.press(screen.getByText("restore text"));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("recomputes dirty from a staged prepared snapshot that restores the published baseline", async () => {
    const onDirtyChange = jest.fn();
    mockPrepareSave.mockImplementationOnce(async (pages, cursor) => ({
      cursor,
      pages: [{ ...pages[0], headline: "Hello" }, ...pages.slice(1)],
    }));
    render(<SharedAlbumEditor accessToken="token" album={album} giftId="gift-1" onAccessLost={jest.fn()} onDirtyChange={onDirtyChange} onPublished={jest.fn()} />);
    fireEvent.press(screen.getByText("change text"));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.press(screen.getByText("暂存当前修改"));
    await screen.findByText("修改已暂存在当前编辑会话，尚未发布。");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByTestId("canvas-pages").props.children).toContain("Hello");
  });

  it("stages canvas and metadata edits locally without publishing or clearing dirty", async () => {
    const onDirtyChange = jest.fn();
    const onPublished = jest.fn();
    const onExit = jest.fn();
    const view = render(<SharedAlbumEditor accessToken="token" album={album} giftId="gift-1" onAccessLost={jest.fn()} onDirtyChange={onDirtyChange} onExit={onExit} onPublished={onPublished} />);
    fireEvent.press(screen.getByText("change text"));
    actMetadataChange(view, { title: "  Renamed trip  ", travelDate: "2026-08-17" });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.press(screen.getByText("暂存当前修改"));
    await screen.findByText("修改已暂存在当前编辑会话，尚未发布。");
    expect(mockPrepareSave).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("canvas-pages").props.children).toContain("Changed");
    expect(view.UNSAFE_getByType(AlbumMetadataEditor).props).toEqual(expect.objectContaining({
      title: "  Renamed trip  ",
      travelDate: "2026-08-17",
    }));
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockFinish).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(onPublished).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it("stages owner canvas and metadata edits with zero remote side effects", async () => {
    const onDirtyChange = jest.fn();
    const onPublished = jest.fn();
    const onExit = jest.fn();
    const onPublishBusyChange = jest.fn();
    const view = render(<SharedAlbumEditor accessToken="token" album={{ ...album, role: "owner" }} giftId="gift-1" onAccessLost={jest.fn()} onDirtyChange={onDirtyChange} onExit={onExit} onPublishBusyChange={onPublishBusyChange} onPublished={onPublished} />);
    fireEvent.press(screen.getByText("change text"));
    actMetadataChange(view, { title: "Owner staged draft", travelDate: "2026-08-19" });
    fireEvent.press(screen.getByText("暂存当前修改"));
    await screen.findByText("修改已暂存在当前编辑会话，尚未发布。");
    expect(mockPrepareSave).toHaveBeenCalledTimes(1);
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockFinish).not.toHaveBeenCalled();
    expect(mockStartOwned).not.toHaveBeenCalled();
    expect(mockFinishOwned).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(onPublished).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
    expect(onPublishBusyChange).not.toHaveBeenCalled();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it("publishes the second prepare snapshot after staging and includes current metadata", async () => {
    mockStart.mockResolvedValueOnce({ publicationId: "pub-latest", uploads: [], coverUpload: null });
    const view = render(<SharedAlbumEditor accessToken="token" album={album} giftId="gift-1" onAccessLost={jest.fn()} onPublished={jest.fn()} />);
    fireEvent.press(screen.getByText("change text"));
    actMetadataChange(view, { title: "  Latest name  ", travelDate: null });
    mockPrepareSave
      .mockImplementationOnce(async (pages, cursor) => ({ pages: [{ ...pages[0], headline: "Staged snapshot" }], cursor }))
      .mockImplementationOnce(async (pages, cursor) => ({ pages: [{ ...pages[0], headline: "Newest snapshot" }], cursor }));
    fireEvent.press(screen.getByText("暂存当前修改"));
    await screen.findByText("修改已暂存在当前编辑会话，尚未发布。");
    fireEvent.press(screen.getByText("change text"));
    fireEvent.press(screen.getByText("保存并发布更新"));
    await waitFor(() => expect(mockFinish).toHaveBeenCalled());
    expect(mockPrepareSave).toHaveBeenCalledTimes(2);
    expect(mockStart.mock.calls[0][2]).toEqual(expect.objectContaining({ title: "Latest name", travelDate: null }));
    expect(mockStart.mock.calls[0][2].pages[0].page.headline).toBe("Newest snapshot");
  });

  it("rejects an empty title before media reads or publication APIs", async () => {
    const view = render(<SharedAlbumEditor accessToken="token" album={album} giftId="gift-1" onAccessLost={jest.fn()} onPublished={jest.fn()} />);
    actMetadataChange(view, { title: "   " });
    fireEvent.press(screen.getByText("保存并发布更新"));
    await screen.findByText("请输入纪念册标题");
    expect(mockPrepareSave).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockStartOwned).not.toHaveBeenCalled();
  });

  it("does not mark a no-change stage dirty even when prepare returns a cloned array", async () => {
    const onDirtyChange = jest.fn();
    const onPublished = jest.fn();
    const onExit = jest.fn();
    mockPrepareSave.mockImplementationOnce(async (pages, cursor) => ({ pages: pages.map((page: any) => ({ ...page })), cursor }));
    render(<SharedAlbumEditor accessToken="token" album={album} giftId="gift-1" onAccessLost={jest.fn()} onDirtyChange={onDirtyChange} onExit={onExit} onPublished={onPublished} />);
    fireEvent.press(screen.getByText("暂存当前修改"));
    await screen.findByText("修改已暂存在当前编辑会话，尚未发布。");
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockFinish).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(onPublished).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
  });

  it("marks an unreported prepared Canvas draft dirty when staging", async () => {
    const onDirtyChange = jest.fn();
    mockPrepareSave.mockImplementationOnce(async (pages, cursor) => ({
      cursor,
      pages: [{ ...pages[0], headline: "Open staged draft" }, ...pages.slice(1)],
    }));
    render(<SharedAlbumEditor accessToken="token" album={album} giftId="gift-1" onAccessLost={jest.fn()} onDirtyChange={onDirtyChange} onPublished={jest.fn()} />);
    fireEvent.press(screen.getByText("暂存当前修改"));
    await screen.findByText("修改已暂存在当前编辑会话，尚未发布。");
    expect(screen.getByTestId("canvas-pages").props.children).toContain("Open staged draft");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("clears dirty only after a successful publication", async () => {
    const onDirtyChange = jest.fn();
    const onPublishBusyChange = jest.fn();
    mockStart.mockResolvedValueOnce({ publicationId: "pub-clean", uploads: [], coverUpload: null });
    render(<SharedAlbumEditor accessToken="token" album={album} giftId="gift-1" onAccessLost={jest.fn()} onDirtyChange={onDirtyChange} onPublishBusyChange={onPublishBusyChange} onPublished={jest.fn()} />);
    fireEvent.press(screen.getByText("change text"));
    fireEvent.press(screen.getByText("保存并发布更新"));
    await waitFor(() => expect(mockFinish).toHaveBeenCalled());
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(onPublishBusyChange.mock.calls).toEqual([[true], [false]]);
  });

  it("can retry staging after pending and thrown prepare results", async () => {
    mockPrepareSave
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("prepare failed"))
      .mockImplementationOnce(async (pages, cursor) => ({ pages, cursor }));
    render(<SharedAlbumEditor accessToken="token" album={album} giftId="gift-1" onAccessLost={jest.fn()} onPublished={jest.fn()} />);
    fireEvent.press(screen.getByText("change text"));
    fireEvent.press(screen.getByText("暂存当前修改"));
    await screen.findByText("正在完成编辑，请稍后重试。");
    fireEvent.press(screen.getByText("暂存当前修改"));
    await screen.findByText("prepare failed");
    expect(screen.getByTestId("canvas-pages").props.children).toContain("Changed");
    fireEvent.press(screen.getByText("暂存当前修改"));
    await screen.findByText("修改已暂存在当前编辑会话，尚未发布。");
    expect(mockPrepareSave).toHaveBeenCalledTimes(3);
    expect(mockReleaseSaveLock).toHaveBeenCalledTimes(3);
    expect(mockStart).not.toHaveBeenCalled();
  });
});

function actMetadataChange(view: ReturnType<typeof render>, change: { title?: string; travelDate?: string | null }) {
  act(() => view.UNSAFE_getByType(AlbumMetadataEditor).props.onChange(change));
}
