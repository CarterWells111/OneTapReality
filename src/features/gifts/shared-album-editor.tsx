import * as React from "react";
import { Text, View } from "react-native";

import { AppButton, bodyFont, colors } from "../../components/ui";
import { BackendApiClient, BackendApiError, type InvitedGiftAlbum } from "../../services/backend/api-client";
import type { CanvasElement, StoryPage } from "../../types/memory";
import { BookCanvasEditor } from "../canvas/book-canvas-editor";
import { mapSharedAlbumToStoryPages } from "./shared-album-mapper";

type Props = {
  accessToken: string;
  album: InvitedGiftAlbum;
  giftId: string;
  onAccessLost: () => void;
  onPublished: () => void | Promise<void>;
};

type MediaSource = { uri: string; existingId?: string; contentType?: string; byteSize?: number };

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

export function SharedAlbumEditor({ accessToken, album, giftId, onAccessLost, onPublished }: Props) {
  const client = React.useMemo(() => new BackendApiClient(), []);
  const [pages, setPages] = React.useState(() => mapSharedAlbumToStoryPages(album));
  const [busy, setBusy] = React.useState(false);
  const [stale, setStale] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const inFlight = React.useRef(false);
  const isOwner = album.role === "owner";

  const publish = async () => {
    if (inFlight.current || stale) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const existingByUrl = new Map(album.media.map((media) => [media.readUrl, media]));
      const sources: MediaSource[] = [];
      const seen = new Set<string>();
      pages.flatMap(pageImageUris).forEach((uri) => {
        if (seen.has(uri)) return;
        seen.add(uri);
        const existing = existingByUrl.get(uri);
        sources.push(existing ? { uri, existingId: existing.id, contentType: existing.contentType } : { uri });
      });
      for (const source of sources) {
        if (source.existingId) continue;
        const response = await fetch(source.uri);
        if (!response.ok) throw new Error("有照片无法读取，请重新选择后再发布。");
        const blob = await response.blob();
        source.contentType = blob.type || "image/jpeg";
        source.byteSize = blob.size;
      }
      let coverBlob: Blob | null = null;
      if (album.cover) {
        const response = await fetch(album.cover.readUrl);
        if (!response.ok) throw new Error("封面图片无法读取，请重新加载后再发布。");
        coverBlob = await response.blob();
      }
      const refs = new Map(sources.map((source, position) => [source.uri, { position, ...(source.existingId ? { mediaId: source.existingId } : {}) }]));
      const publishPayload = {
        baseVersion: album.version,
        sourceMemoryId: `shared:${giftId}`,
        title: album.title,
        pages: pages.map((page, position) => ({ position, page: snapshotPage(page, refs) })),
        media: sources.map((source, position) => source.existingId
          ? { position, mediaId: source.existingId }
          : { position, contentType: source.contentType!, byteSize: source.byteSize! }),
        cover: coverBlob ? { contentType: coverBlob.type || album.cover!.contentType, byteSize: coverBlob.size } : null,
      };
      const publication = isOwner
        ? await client.startOwnedGiftPublish(accessToken, giftId, publishPayload)
        : await client.startInvitedGiftPublish(giftId, accessToken, publishPayload);
      for (const upload of publication.uploads) {
        const source = sources[upload.position];
        if (!source || source.existingId) throw new Error("上传清单不完整。");
        const readResponse = await fetch(source.uri);
        if (!readResponse.ok) throw new Error("有照片无法读取，请重新选择后再发布。");
        const blob = await readResponse.blob();
        const response = await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": source.contentType! }, body: blob });
        if (!response.ok) throw new Error("照片上传失败。");
      }
      if (publication.coverUpload && coverBlob) {
        const response = await fetch(publication.coverUpload.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": coverBlob.type || album.cover!.contentType },
          body: coverBlob,
        });
        if (!response.ok) throw new Error("封面上传失败。");
      }
      if (isOwner) await client.finishOwnedGiftPublish(accessToken, giftId, publication.publicationId);
      else await client.finishInvitedGiftPublish(giftId, accessToken, publication.publicationId);
      await onPublished();
    } catch (error) {
      if (error instanceof BackendApiError && error.status === 403) {
        setPages([]);
        onAccessLost();
      } else if (error instanceof BackendApiError && error.status === 409 && error.code === "gift_album_version_conflict") {
        setStale(true);
        setMessage("相册已有新版本，请重新加载后再编辑。");
      } else {
        setMessage(error instanceof Error ? error.message : "发布失败，请重试。");
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return <View style={{ gap: 12 }}>
    <BookCanvasEditor pages={pages} onPagesChange={(nextPages) => setPages(nextPages)} />
    {message ? <Text style={{ color: colors.muted, fontFamily: bodyFont }}>{message}</Text> : null}
    <AppButton disabled={busy || stale} label={busy ? "正在发布…" : "发布新版本"} onPress={() => void publish()} />
    {stale ? <AppButton label="重新加载最新版" tone="secondary" onPress={() => void onPublished()} /> : null}
  </View>;
}
