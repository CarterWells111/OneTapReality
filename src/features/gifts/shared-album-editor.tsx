import * as React from "react";
import * as FileSystem from "expo-file-system/legacy";
import { Text, View } from "react-native";

import { AppButton, bodyFont, colors } from "../../components/ui";
import {
  BackendApiClient,
  BackendApiError,
  type InvitedGiftAlbum,
} from "../../services/backend/api-client";
import {
  toUserFacingOperationError,
} from "../../services/backend/user-facing-error";
import type { StoryPage } from "../../types/memory";
import {
  BookCanvasEditor,
  type BookCanvasEditorHandle,
} from "../canvas/book-canvas-editor";
import { splitOverflowPhotoPages } from "../canvas/photo-page-limit";
import {
  AlbumMetadataEditor,
  type AlbumMetadataValue,
} from "../memories/album-metadata-editor";
import { createPhotoStagingSession, type PhotoStagingSession } from "../memories/photo-persistence";
import { mapSharedAlbumToEditablePages } from "./shared-album-mapper";
import { createGiftImageDerivative, removeGiftImageDerivatives, type GiftImageDerivative } from "./gift-image-derivative";
import { collectPublicationSources, snapshotPagesForPublication } from "./publication-snapshot";
import { uploadPublicationFile, uploadPublicationFiles, type PublicationUploadFile } from "./publication-uploader";

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

function imageContentType(uri: string) {
  const lower = uri.split("?")[0].toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  return "image/jpeg";
}

const PREPARE_SAVE_PENDING_MESSAGE = "正在完成编辑，请稍后重试。";
const STAGED_MESSAGE = "修改已暂存在当前编辑会话，尚未发布。";
let sharedPhotoSessionSequence = 0;

function nextSharedPhotoSessionId(giftId: string) {
  sharedPhotoSessionSequence += 1;
  return `shared-gift-${giftId}-${Date.now()}-${sharedPhotoSessionSequence}-${Math.random().toString(36).slice(2, 8)}`;
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
  const initialPages = React.useMemo(() => splitOverflowPhotoPages(mapSharedAlbumToEditablePages(album)), [album]);
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
  const editorChangePendingRef = React.useRef(false);
  const mountedRef = React.useRef(true);
  const operationGeneration = React.useRef(0);
  const accessLostGeneration = React.useRef<number | null>(null);
  const accessLostNotified = React.useRef(false);
  const editorRef = React.useRef<BookCanvasEditorHandle>(null);
  const pagesRef = React.useRef(pages);
  const metadataRef = React.useRef(metadata);
  const dirtyRef = React.useRef(false);
  const publishedBaseline = React.useRef(createPublishedBaseline(initialPages, album));
  const photoStagingSessionRef = React.useRef<PhotoStagingSession | null>(null);
  if (!photoStagingSessionRef.current) {
    photoStagingSessionRef.current = createPhotoStagingSession(nextSharedPhotoSessionId(giftId));
  }
  const photoStagingSession = photoStagingSessionRef.current;
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
    if (inFlight.current || stale) return false;
    pagesRef.current = nextPages;
    setPages(nextPages);
    changeDirty(hasEffectiveChanges(nextPages, metadataRef.current, publishedBaseline.current));
    return true;
  }, [changeDirty, stale]);
  const handleMetadataChange = React.useCallback((change: Partial<AlbumMetadataValue>) => {
    const nextMetadata = { ...metadataRef.current, ...change };
    metadataRef.current = nextMetadata;
    setMetadata(nextMetadata);
    changeDirty(hasEffectiveChanges(pagesRef.current, nextMetadata, publishedBaseline.current));
  }, [changeDirty]);

  const cleanupPhotoStagingSession = React.useCallback(async () => {
    try {
      await photoStagingSession.cleanup();
    } catch (error) {
      console.warn("[shared-album-editor] 无法清理照片暂存会话：", error);
    }
  }, [photoStagingSession]);

  React.useEffect(() => () => {
    void cleanupPhotoStagingSession();
  }, [cleanupPhotoStagingSession]);

  const changeEditorPending = React.useCallback((pending: boolean) => {
    editorChangePendingRef.current = pending;
    setTransformPending(pending);
  }, []);

  const stageSelectedPhoto = React.useCallback(
    (uri: string) => photoStagingSession.stagePhoto(uri),
    [photoStagingSession],
  );

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
    if (inFlight.current || stale || editorChangePendingRef.current) return;
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
    } catch {
      if (current()) setMessage(PREPARE_SAVE_PENDING_MESSAGE);
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
    if (inFlight.current || stale || editorChangePendingRef.current) return;
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
    const derivatives: GiftImageDerivative[] = [];
    let downloadedCoverUri: string | null = null;
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
      const sources = collectPublicationSources(publishPages, existingByUrl);
      const derivativesByPosition = new Map<number, GiftImageDerivative>();
      const newSources = sources.filter((source) => !source.existingId);
      let optimizedCount = 0;
      for (let position = 0; position < sources.length; position += 1) {
        const source = sources[position];
        if (source.existingId) continue;
        optimizedCount += 1;
        setMessage(`正在优化照片 ${optimizedCount}/${newSources.length}…`);
        try {
          const derivative = await createGiftImageDerivative(source.uri, imageContentType(source.uri));
          derivatives.push(derivative);
          derivativesByPosition.set(position, derivative);
        } catch {
          throw new Error(`第 ${position + 1} 张照片无法处理，请重新选择后再试。`);
        }
      }
      let coverDerivative: GiftImageDerivative | null = null;
      if (album.cover) {
        if (!FileSystem.cacheDirectory) throw new Error("无法使用临时目录处理封面。");
        downloadedCoverUri = `${FileSystem.cacheDirectory}gift-cover-${giftId}-${Date.now()}`;
        const download = await FileSystem.downloadAsync(album.cover.readUrl, downloadedCoverUri);
        downloadedCoverUri = download.uri;
        setMessage("正在优化礼品封面…");
        coverDerivative = await createGiftImageDerivative(download.uri, album.cover.contentType);
        derivatives.push(coverDerivative);
      }
      const references = sources.map((source, position) => ({ ...source, position }));
      const publishPayload = {
        baseVersion: album.version,
        sourceMemoryId: `shared:${giftId}`,
        title,
        travelDate: publishMetadata.travelDate,
        pages: snapshotPagesForPublication(publishPages, references),
        media: sources.map((source, position) => source.existingId
          ? { position, mediaId: source.existingId }
          : { position, contentType: derivativesByPosition.get(position)!.contentType, byteSize: derivativesByPosition.get(position)!.byteSize }),
        cover: coverDerivative ? { contentType: coverDerivative.contentType, byteSize: coverDerivative.byteSize } : null,
      };
      const publication = isOwner
        ? await client.startOwnedGiftPublish(accessToken, giftId, publishPayload)
        : await client.startInvitedGiftPublish(giftId, accessToken, publishPayload);
      if (!current()) return;
      const files: PublicationUploadFile[] = publication.uploads.map((upload) => {
        const derivative = derivativesByPosition.get(upload.position);
        if (!derivative) throw new Error("上传清单不完整，请重新发布。");
        return { kind: "media", position: upload.position, uri: derivative.uri, contentType: derivative.contentType, uploadUrl: upload.uploadUrl };
      });
      if (publication.coverUpload && coverDerivative) files.push({
        kind: "cover", uri: coverDerivative.uri, contentType: coverDerivative.contentType, uploadUrl: publication.coverUpload.uploadUrl,
      });
      await uploadPublicationFiles({
        publicationId: publication.publicationId,
        files,
        uploadFile: uploadPublicationFile,
        refreshUploads: (selection) => isOwner
          ? client.refreshOwnedGiftPublishUploads(accessToken, giftId, selection)
          : client.refreshInvitedGiftPublishUploads(giftId, accessToken, selection),
        onProgress: (completed, total) => { if (current()) setMessage(`正在上传照片 ${completed}/${total}…`); },
      });
      if (!current()) return;
      if (isOwner) await client.finishOwnedGiftPublish(accessToken, giftId, publication.publicationId);
      else await client.finishInvitedGiftPublish(giftId, accessToken, publication.publicationId);
      if (!current()) return;
      changeDirty(false);
      if (!current()) return;
      pagesRef.current = [];
      setPages([]);
      await cleanupPhotoStagingSession();
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
        await cleanupPhotoStagingSession();
      } else if (error instanceof BackendApiError && error.status === 409 && error.code === "gift_album_version_conflict") {
        setStale(true);
        setMessage("相册已有新版本，请重新加载后再编辑。");
      } else if (error instanceof BackendApiError && error.code === "gift_publication_unavailable") {
        setMessage("本次发布已超时，请重新发布；当前共享版本未改变。");
      } else if (error instanceof BackendApiError && error.code === "gift_upload_incomplete") {
        setMessage("部分照片尚未完整上传，请重新发布；当前共享版本未改变。");
      } else {
        setMessage(toUserFacingOperationError(error, "发布失败，请检查网络后重试。"));
      }
    } finally {
      operationEditor?.releaseSaveLock();
      await removeGiftImageDerivatives(derivatives);
      if (downloadedCoverUri) {
        await FileSystem.deleteAsync(downloadedCoverUri, { idempotent: true }).catch((error) => {
          console.warn("[gift-publish] 无法清理临时封面：", error);
        });
      }
      inFlight.current = false;
      if (current()) {
        setBusy(false);
        setBusyIntent(null);
        onPublishBusyChange?.(false);
      }
    }
  };

  const reload = async () => {
    if (inFlight.current || editorChangePendingRef.current) return;
    const cursor = activePage.current;
    pagesRef.current = [];
    setPages([]);
    await cleanupPhotoStagingSession();
    await onReload?.(cursor);
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
        onTransformPendingChange={changeEditorPending}
        pages={pages}
        ref={editorRef}
        stageSelectedPhoto={stageSelectedPhoto}
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
    {stale ? <AppButton disabled={busy || transformPending} label="重新加载最新版" tone="secondary" onPress={reload} /> : null}
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
