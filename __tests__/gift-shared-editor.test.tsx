import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockStart = jest.fn();
const mockFinish = jest.fn();
const mockStartOwned = jest.fn();
const mockFinishOwned = jest.fn();

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
  return { BookCanvasEditor: ({ pages, onActivePageChange, onPagesChange }: any) => <>
    <Text testID="canvas-pages">{JSON.stringify(pages)}</Text>
    <Button title="report second page" onPress={() => onActivePageChange?.({ pageId: "p2", index: 1 })} />
    <Button title="add local photo" onPress={() => onPagesChange([...pages, { ...pages[0], id: "new-page", position: 1, photoUri: "file:///new.jpg" }], "structure")} />
    <Button title="set local page cover" onPress={() => onPagesChange([{ ...pages[0], layout: { aspectRatio: 0.75, elements: [], coverImage: "file:///new.jpg" } }], "structure")} />
    <Button title="set local top cover" onPress={() => onPagesChange([{ ...pages[0], coverImage: "file:///new.jpg" }], "structure")} />
    <Button title="add two local photos" onPress={() => onPagesChange([
      { ...pages[0], id: "new-a", photoUri: "file:///a.jpg" },
      { ...pages[0], id: "new-b", position: 1, photoUri: "file:///b.jpg" },
    ], "structure")} />
  </> };
});

import { SharedAlbumEditor } from "../src/features/gifts/shared-album-editor";

const album: any = {
  role: "editor", title: "Trip", version: 4, publishedAt: "2026-08-16T00:00:00Z", cover: null,
  pages: [{ position: 0, page: { id: "p0", position: 0, kind: "photo", headline: "Hello", body: "", photoSlot: 0 } }],
  media: [{ id: "media-1", position: 0, contentType: "image/jpeg", byteSize: 12, readUrl: "https://signed.test/old.jpg" }],
};

describe("SharedAlbumEditor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    fireEvent.press(screen.getByText("发布新版本"));

    await waitFor(() => expect(mockFinish).toHaveBeenCalledWith("gift-1", "token", "pub-1"));
    const payload = mockStart.mock.calls[0][2];
    expect(payload.baseVersion).toBe(4);
    expect(payload.media).toEqual([
      { position: 0, mediaId: "media-1" },
      { position: 1, contentType: "image/jpeg", byteSize: 3 },
    ]);
    expect(JSON.stringify(payload.pages)).not.toContain("https://signed.test");
    expect(global.fetch).toHaveBeenCalledWith("https://upload.test/new", expect.objectContaining({ method: "PUT" }));
    expect(onPublished).toHaveBeenCalledWith({ pageId: "p2", index: 1 });
  });

  it("uses the owner publication API while keeping the same canvas editor payload", async () => {
    const ownedAlbum = { ...album, role: "owner" };
    render(<SharedAlbumEditor accessToken="token" album={ownedAlbum} giftId="gift-1" onAccessLost={jest.fn()} onPublished={jest.fn()} />);
    fireEvent.press(screen.getByText("发布新版本"));
    await waitFor(() => expect(mockFinishOwned).toHaveBeenCalledWith("token", "gift-1", "owned-pub"));
    expect(mockStartOwned).toHaveBeenCalledWith("token", "gift-1", expect.objectContaining({
      baseVersion: 4,
      media: [{ position: 0, mediaId: "media-1" }],
    }));
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("encodes existing and new layout cover images as reloadable stable media refs", async () => {
    const existingCoverAlbum = {
      ...album,
      pages: [{ position: 0, page: { id: "p0", position: 0, kind: "cover", headline: "", body: "", layout: { aspectRatio: 0.75, elements: [], coverImage: "shared-media:media-1" } } }],
    };
    mockStart.mockResolvedValueOnce({ publicationId: "pub-existing", uploads: [], coverUpload: null });
    const firstView = render(<SharedAlbumEditor accessToken="token" album={existingCoverAlbum} giftId="gift-1" onAccessLost={jest.fn()} onPublished={jest.fn()} />);
    expect(screen.getByTestId("canvas-pages").props.children).toContain("https://signed.test/old.jpg");
    fireEvent.press(screen.getByText("发布新版本"));
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
    fireEvent.press(screen.getByText("发布新版本"));
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
    fireEvent.press(screen.getByText("发布新版本"));
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
    fireEvent.press(screen.getByText("发布新版本"));
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
    fireEvent.press(screen.getByText("发布新版本"));
    await waitFor(() => expect(screen.getByText("相册已有新版本，请重新加载后再编辑。" )).toBeTruthy());
    fireEvent.press(screen.getByText("发布新版本"));
    expect(mockStart).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByText("重新加载最新版"));
    expect(onPublished).not.toHaveBeenCalled();
    expect(onReload).toHaveBeenCalled();
  });

  it("clears editing when editor access is revoked and prevents duplicate submits", async () => {
    const { BackendApiError } = require("../src/services/backend/api-client");
    let reject!: (error: Error) => void;
    mockStart.mockReturnValueOnce(new Promise((_resolve, nextReject) => { reject = nextReject; }));
    const onAccessLost = jest.fn();
    render(<SharedAlbumEditor accessToken="token" album={album} giftId="gift-1" onAccessLost={onAccessLost} onPublished={jest.fn()} />);
    fireEvent.press(screen.getByText("发布新版本"));
    fireEvent.press(screen.getByText("正在发布…"));
    expect(mockStart).toHaveBeenCalledTimes(1);
    reject(new BackendApiError(403, "gift_editor_required", "revoked"));
    await waitFor(() => expect(onAccessLost).toHaveBeenCalled());
  });
});
