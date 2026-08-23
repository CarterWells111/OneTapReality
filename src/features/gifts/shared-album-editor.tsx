import * as React from "react";
import { Text, View } from "react-native";

import { AppButton, bodyFont, colors } from "../../components/ui";
import {
  BackendApiClient,
  BackendApiError,
  type InvitedGiftAlbum,
  type SharedAlbumPublishPayload,
} from "../../services/backend/api-client";
import type { CanvasElement, StoryPage } from "../../types/memory";
import {
  BookCanvasEditor,
  type BookCanvasEditorHandle,
} from "../canvas/book-canvas-editor";
import {
  AlbumMetadataEditor,
  type AlbumMetadataValue,
} from "../memories/album-metadata-editor";
import { mapSharedAlbumToEditablePages } from "./shared-album-mapper";

type Props = {
  accessToken: string;
  album: InvitedGiftAlbum;
  fallbackIndex?: number;
  giftId: string;
  initialPageId?: string;
  onAccessLost: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onExit?: (cursor: { pageId: string; index: number }) => void;
  onPublishBusyChange?: (busy: boolean) => void;
  onPublished: (result: { cursor: { pageId: string; index: number } }) => void | Promise<void>;
  onReload?: (cursor: { pageId: string; index: number }) => void | Promise<void>;
};

type MediaSource = { uri: string; existingId?: string; contentType?: string; byteSize?: number };

const PREPARE_SAVE_PENDING_MESSAGE = "正在完成编辑，请稍后重试。";
const STAGED_MESSAGE = "修改已暂存在当前编辑会话，尚未发布。";

function pageImageUris(page: StoryPage) {
  const uris: string[] = [];
  if (page.photoUri) uris.push(page.photoUri);
  if (page.coverImage) uris.push(page.coverImage);
  if (page.layout?.coverImage) uris.push(page.layout.coverImage);
  page.layout?.elements.forEach((element) => { if (element.type === "image" && element.uri) uris.push(element.uri); });
  return uris;
}

function snapshotPage(page: StoryPage, positions: Map<string, { position: number; mediaId?: string }>) {
  const { photoUri: _photoUri, coverImage, ...safe } = page;
  const topCover = coverImage ? positions.get(coverImage) : undefined;
  const withTopCover = {
    ...safe,
    ...(topCover ? { coverImage: topCover.mediaId ? `shared-media:${topCover.mediaId}` : `shared-position:${topCover.position}` } : {}),
  };
  if (!safe.layout) return withTopCover;
  return {
    ...withTopCover,
    layout: {
      ...safe.layout,
      ...(safe.layout.coverImage && positions.get(safe.layout.coverImage)
        ? { coverImage: positions.get(safe.layout.coverImage)!.mediaId
          ? `shared-media:${positions.get(safe.layout.coverImage)!.mediaId}`
          : `shared-position:${positions.get(safe.layout.coverImage)!.position}` }
        : {}),
      elements: safe.layout.elements.map((element): CanvasElement | Record<string, unknown> => {
        if (element.type !== "image") return element;
        const ref = positions.get(element.uri);
        return { ...element, uri: "", ...(ref?.mediaId ? { mediaId: ref.mediaId } : {}), ...(ref ? { mediaPosition: ref.position } : {}) };
      }),
    },
  };
}

export function SharedAlbumEditor({
  accessToken,
  album,
  fallbackIndex = 0,
  giftId,
  initialPageId,
  onAccessLost,
  onDirtyChange,
  onExit,
  onPublishBusyChange,
  onPublished,
  onReload,
}: Props) {
  const client = React.useMemo(() => new BackendApiClient(), []);
  const initialPages = React.useMemo(() => mapSharedAlbumToEditablePages(album), [album]);
  const [pages, setPages] = React.useState(initialPages);
  const [metadata, setMetadata] = React.useState<AlbumMetadataValue>({
    title: album.title,
    travelDate: album.travelDate,
  });
  const [busy, setBusy] = React.useState(false);
  const [busyIntent, setBusyIntent] = React.useState<"stage" | "publish" | null>(null);
  const [, setDirty] = React.useState(false);
  const [stale, setStale] = React.useState(false);
  const [accessLost, setAccessLost] = React.useState(false);
  const [transformPending, setTransformPending] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const inFlight = React.useRef(false);
  const mountedRef = React.useRef(true);
  const operationGeneration = React.useRef(0);
  const accessLostGeneration = React.useRef<number | null>(null);
  const accessLostNotified = React.useRef(false);
  const editorRef = React.useRef<BookCanvasEditorHandle>(null);
  const pagesRef = React.useRef(pages);
  const metadataRef = React.useRef(metadata);
  const dirtyRef = React.useRef(false);
  const publishedBaseline = React.useRef(createPublishedBaseline(initialPages, album));
  pagesRef.current = pages;
  metadataRef.current = metadata;
  const initialIndex = resolveInitialIndex(initialPages, initialPageId, fallbackIndex);
  const activePage = React.useRef({ pageId: initialPages[initialIndex]?.id ?? "", index: initialIndex });
  const handleActivePageChange = React.useCallback((cursor: { pageId: string; index: number }) => {
    activePage.current = cursor;
  }, []);
  const isOwner = album.role === "owner";
  const changeDirty = React.useCallback((nextDirty: boolean) => {
    dirtyRef.current = nextDirty;
    setDirty(nextDirty);
    onDirtyChange?.(nextDirty);
  }, [onDirtyChange]);
  const handlePagesChange = React.useCallback((nextPages: StoryPage[]) => {
    pagesRef.current = nextPages;
    setPages(nextPages);
    changeDirty(hasEffectiveChanges(nextPages, metadataRef.current, publishedBaseline.current));
  }, [changeDirty]);
  const handleMetadataChange = React.useCallback((change: Partial<AlbumMetadataValue>) => {
    const nextMetadata = { ...metadataRef.current, ...change };
    metadataRef.current = nextMetadata;
    setMetadata(nextMetadata);
    changeDirty(hasEffectiveChanges(pagesRef.current, nextMetadata, publishedBaseline.current));
  }, [changeDirty]);

  React.useEffect(() => {
    mountedRef.current = true;
    const mountedEditor = editorRef.current;
    return () => {
      mountedRef.current = false;
      operationGeneration.current += 1;
      mountedEditor?.releaseSaveLock();
    };
  }, []);

  React.useEffect(() => {
    if (!accessLost || accessLostNotified.current) return;
    const generation = accessLostGeneration.current;
    if (!mountedRef.current || generation === null || generation !== operationGeneration.current) return;
    accessLostNotified.current = true;
    onAccessLost();
  }, [accessLost, onAccessLost]);

  const stage = async () => {
    if (inFlight.current || stale || transformPending) return;
    const generation = ++operationGeneration.current;
    const current = () => mountedRef.current && generation === operationGeneration.current;
    const operationEditor = editorRef.current;
    inFlight.current = true;
    setBusy(true);
    setBusyIntent("stage");
    setMessage("");
    try {
      const prepared = await operationEditor?.prepareSave();
      if (!current()) return;
      if (!prepared) {
        setMessage(PREPARE_SAVE_PENDING_MESSAGE);
        return;
      }
      const publishPages = prepared.pages;
      const publishCursor = prepared.cursor;
      activePage.current = publishCursor;
      pagesRef.current = publishPages;
      setPages(publishPages);
      changeDirty(hasEffectiveChanges(publishPages, metadataRef.current, publishedBaseline.current));
      setMessage(STAGED_MESSAGE);
    } catch (error) {
      if (current()) setMessage(error instanceof Error ? error.message : PREPARE_SAVE_PENDING_MESSAGE);
    } finally {
      operationEditor?.releaseSaveLock();
      inFlight.current = false;
      if (current()) {
        setBusy(false);
        setBusyIntent(null);
      }
    }
  };

  const publish = async () => {
    if (inFlight.current || stale || transformPending) return;
    const title = metadata.title.trim();
    if (!title) {
      setMessage("请输入纪念册标题");
      return;
    }
    const generation = ++operationGeneration.current;
    const current = () => mountedRef.current && generation === operationGeneration.current;
    const operationEditor = editorRef.current;
    inFlight.current = true;
    onPublishBusyChange?.(true);
    setBusy(true);
    setBusyIntent("publish");
    setMessage("");
    try {
      const prepared = await operationEditor?.prepareSave();
      if (!current()) return;
      if (!prepared) {
        setMessage(PREPARE_SAVE_PENDING_MESSAGE);
        return;
      }
      const publishPages = prepared.pages;
      const publishCursor = prepared.cursor;
      activePage.current = publishCursor;
      const publishMetadata = metadataRef.current;
      if (!hasEffectiveChanges(publishPages, publishMetadata, publishedBaseline.current)) {
        onExit?.(publishCursor);
        return;
      }
      if (!dirtyRef.current) changeDirty(true);
      pagesRef.current = publishPages;
      setPages(publishPages);
      const existingByUrl = new Map(album.media.map((media) => [media.readUrl, media]));
      const sources: MediaSource[] = [];
      const seen = new Set<string>();
      publishPages.flatMap(pageImageUris).forEach((uri) => {
        if (seen.has(uri)) return;
        seen.add(uri);
        const existing = existingByUrl.get(uri);
        sources.push(existing ? { uri, existingId: existing.id, contentType: existing.contentType } : { uri });
      });
      for (const source of sources) {
        if (source.existingId) continue;
        const response = await fetch(source.uri);
        if (!current()) return;
        if (!response.ok) throw new Error("有照片无法读取，请重新选择后再发布。");
        const blob = await response.blob();
        if (!current()) return;
        source.contentType = blob.type || "image/jpeg";
        source.byteSize = blob.size;
      }
      let coverBlob: Blob | null = null;
      if (album.cover) {
        const response = await fetch(album.cover.readUrl);
        if (!current()) return;
        if (!response.ok) throw new Error("封面图片无法读取，请重新加载后再发布。");
        coverBlob = await response.blob();
        if (!current()) return;
      }
      const refs = new Map(sources.map((source, position) => [source.uri, { position, ...(source.existingId ? { mediaId: source.existingId } : {}) }]));
      const publishPayload: SharedAlbumPublishPayload = {
        baseVersion: album.version,
        sourceMemoryId: `shared:${giftId}`,
        title,
        travelDate: publishMetadata.travelDate,
        pages: publishPages.map((page, position) => ({ position, page: snapshotPage(page, refs) })),
        media: sources.map((source, position) => source.existingId
          ? { position, mediaId: source.existingId }
          : { position, contentType: source.contentType!, byteSize: source.byteSize! }),
        cover: coverBlob ? { contentType: coverBlob.type || album.cover!.contentType, byteSize: coverBlob.size } : null,
      };
      const publication = isOwner
        ? await client.startOwnedGiftPublish(accessToken, giftId, publishPayload)
        : await client.startInvitedGiftPublish(giftId, accessToken, publishPayload);
      if (!current()) return;
      for (const upload of publication.uploads) {
        const source = sources[upload.position];
        if (!source || source.existingId) throw new Error("上传清单不完整。");
        const readResponse = await fetch(source.uri);
        if (!current()) return;
        if (!readResponse.ok) throw new Error("有照片无法读取，请重新选择后再发布。");
        const blob = await readResponse.blob();
        if (!current()) return;
        const response = await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": source.contentType! }, body: blob });
        if (!current()) return;
        if (!response.ok) throw new Error("照片上传失败。");
      }
      if (publication.coverUpload && coverBlob) {
        const response = await fetch(publication.coverUpload.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": coverBlob.type || album.cover!.contentType },
          body: coverBlob,
        });
        if (!current()) return;
        if (!response.ok) throw new Error("封面上传失败。");
      }
      if (isOwner) await client.finishOwnedGiftPublish(accessToken, giftId, publication.publicationId);
      else await client.finishInvitedGiftPublish(giftId, accessToken, publication.publicationId);
      if (!current()) return;
      changeDirty(false);
      if (!current()) return;
      await onPublished({ cursor: publishCursor });
    } catch (error) {
      if (!current()) return;
      if (error instanceof BackendApiError && error.status === 403) {
        accessLostGeneration.current = generation;
        setAccessLost(true);
        pagesRef.current = [];
        setPages([]);
        const clearedMetadata = { title: "", travelDate: null };
        metadataRef.current = clearedMetadata;
        setMetadata(clearedMetadata);
        changeDirty(false);
      } else if (error instanceof BackendApiError && error.status === 409 && error.code === "gift_album_version_conflict") {
        setStale(true);
        setMessage("相册已有新版本，请重新加载后再编辑。");
      } else {
        setMessage(error instanceof Error ? error.message : "发布失败，请重试。");
      }
    } finally {
      operationEditor?.releaseSaveLock();
      inFlight.current = false;
      if (current()) {
        setBusy(false);
        setBusyIntent(null);
        onPublishBusyChange?.(false);
      }
    }
  };

  if (accessLost) return null;

  return <View style={{ gap: 12 }}>
    <AlbumMetadataEditor
      disabled={busy || stale}
      onChange={handleMetadataChange}
      title={metadata.title}
      travelDate={metadata.travelDate}
    />
    <View pointerEvents={busy || stale ? "none" : "auto"}>
      <BookCanvasEditor
        fallbackIndex={fallbackIndex}
        initialPageId={initialPageId}
        onActivePageChange={handleActivePageChange}
        onPagesChange={handlePagesChange}
        onTransformPendingChange={setTransformPending}
        pages={pages}
        ref={editorRef}
      />
    </View>
    {message ? <Text style={{ color: colors.muted, fontFamily: bodyFont }}>{message}</Text> : null}
    <AppButton
      disabled={busy || stale || transformPending}
      label={busyIntent === "stage" ? "正在暂存…" : "暂存当前修改"}
      onPress={() => void stage()}
      tone="secondary"
    />
    <AppButton
      disabled={busy || stale || transformPending}
      label={busyIntent === "publish" ? "正在发布…" : "保存并发布更新"}
      onPress={() => void publish()}
    />
    {stale ? <AppButton label="重新加载最新版" tone="secondary" onPress={() => void onReload?.(activePage.current)} /> : null}
  </View>;
}

type PublishedBaseline = {
  pagesSignature: string;
  title: string;
  travelDate: string | null;
};

function createPublishedBaseline(pages: StoryPage[], album: InvitedGiftAlbum): PublishedBaseline {
  return {
    pagesSignature: storyPagesSignature(pages),
    title: album.title.trim(),
    travelDate: album.travelDate,
  };
}

function hasEffectiveChanges(pages: StoryPage[], metadata: AlbumMetadataValue, baseline: PublishedBaseline) {
  return storyPagesSignature(pages) !== baseline.pagesSignature
    || metadata.title.trim() !== baseline.title
    || metadata.travelDate !== baseline.travelDate;
}

function storyPagesSignature(pages: StoryPage[]) {
  return JSON.stringify(pages);
}

function resolveInitialIndex(pages: StoryPage[], pageId?: string, fallbackIndex = 0) {
  const pageIdIndex = pageId ? pages.findIndex((page) => page.id === pageId) : -1;
  if (pageIdIndex >= 0) return pageIdIndex;
  return Math.max(0, Math.min(fallbackIndex, Math.max(0, pages.length - 1)));
}
