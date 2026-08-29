import {
  mapSharedAlbumToEditablePages,
  mapSharedAlbumToStoryPages,
} from "../src/features/gifts/shared-album-mapper";

describe("shared album snapshot mapper", () => {
  it("prefers stable media references and preserves the complete canvas page", () => {
    const pages = mapSharedAlbumToStoryPages({
      role: "editor",
      title: "Trip",
      travelDate: null,
      pages: [{
        position: 4,
        page: {
          id: "page-4",
          position: 4,
          kind: "cover",
          headline: "A headline",
          body: "A body",
          coverColor: "#123456",
          token: "nfc-secret",
          layout: {
            aspectRatio: 0.7,
            photoTemplateId: "magazine-1",
            backgroundId: "paper-grid",
            coverColor: "#abcdef",
            coverImage: "shared-media:media-1",
            coverCrop: { focusX: 0.25, focusY: 0.75, zoom: 2 },
            elements: [
              { id: "second", type: "image", uri: "file:///old.jpg", mediaId: "media-2", crop: { focusX: 0.8, focusY: 0.2, zoom: 3 }, x: 0.1, y: 0.2, width: 0.3, height: 0.4, rotation: 5, zIndex: 2 },
              { id: "caption", type: "text", text: "Keep me", fontStyle: "georgia", color: "#fedcba", fontSize: 18, x: 0, y: 0.7, width: 1, height: 0.2, rotation: 0, zIndex: 3 },
            ],
          },
        },
      }],
      media: [
        { id: "media-1", position: 0, contentType: "image/jpeg", byteSize: 10, readUrl: "https://cdn.test/first.jpg" },
        { id: "media-2", position: 1, contentType: "image/jpeg", byteSize: 10, readUrl: "https://cdn.test/second.jpg" },
      ],
      publishedAt: "2026-08-16T00:00:00.000Z",
      version: 2,
      cover: null,
    });

    expect(pages).toEqual([expect.objectContaining({
      id: "page-4",
      position: 4,
      kind: "cover",
      headline: "A headline",
      body: "A body",
      coverColor: "#123456",
      layout: expect.objectContaining({
        aspectRatio: 0.7,
        photoTemplateId: "magazine-1",
        backgroundId: "paper-grid",
        coverColor: "#abcdef",
        coverImage: "https://cdn.test/first.jpg",
        coverCrop: { focusX: 0.25, focusY: 0.75, zoom: 2 },
        elements: [
          expect.objectContaining({ id: "second", uri: "https://cdn.test/second.jpg", crop: { focusX: 0.8, focusY: 0.2, zoom: 3 }, rotation: 5, zIndex: 2 }),
          expect.objectContaining({ id: "caption", text: "Keep me", color: "#fedcba", fontSize: 18 }),
        ],
      }),
    })]);
    expect(pages[0]).not.toHaveProperty("token");
  });

  it("preserves known photo templates and rejects forged IDs in shared snapshots", () => {
    const base = {
      role: "viewer" as const,
      title: "Template",
      travelDate: null,
      pages: [{ position: 0, page: { layout: { aspectRatio: 0.75, photoTemplateId: "story-1", elements: [
        { id: "image", type: "image", uri: "", mediaPosition: 0, x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotation: 0, zIndex: 1 },
      ] } } }],
      media: [{ id: "media", position: 0, contentType: "image/jpeg", byteSize: 1, readUrl: "https://cdn.test/template.jpg" }],
      publishedAt: "2026-08-16T00:00:00Z",
      version: 1,
      cover: null,
    };
    expect(mapSharedAlbumToStoryPages(base)[0].layout).toHaveProperty("photoTemplateId", "story-1");
    expect(mapSharedAlbumToStoryPages({
      ...base,
      pages: [{ position: 0, page: { layout: { ...base.pages[0].page.layout, photoTemplateId: "forged-template" } } }],
    })[0].layout).not.toHaveProperty("photoTemplateId");
  });

  it("drops a known template with the wrong image count while preserving freeform geometry", () => {
    const elements = [
      { id: "first", type: "image", uri: "", mediaPosition: 0, x: 0.11, y: 0.12, width: 0.31, height: 0.32, rotation: -4, zIndex: 5 },
      { id: "second", type: "image", uri: "", mediaPosition: 1, x: 0.51, y: 0.52, width: 0.33, height: 0.34, rotation: 6, zIndex: 7 },
    ];
    const pages = mapSharedAlbumToStoryPages({
      role: "viewer",
      title: "Mismatched template",
      travelDate: null,
      pages: [{ position: 0, page: { layout: { aspectRatio: 0.75, photoTemplateId: "classic-3", elements } } }],
      media: [
        { id: "first-media", position: 0, contentType: "image/jpeg", byteSize: 1, readUrl: "https://cdn.test/first.jpg" },
        { id: "second-media", position: 1, contentType: "image/jpeg", byteSize: 1, readUrl: "https://cdn.test/second.jpg" },
      ],
      publishedAt: "2026-08-16T00:00:00Z",
      version: 1,
      cover: null,
    });

    expect(pages[0].layout).not.toHaveProperty("photoTemplateId");
    expect(pages[0].layout?.elements).toEqual([
      expect.objectContaining({ id: "first", uri: "https://cdn.test/first.jpg", x: 0.11, y: 0.12, width: 0.31, height: 0.32, rotation: -4, zIndex: 5 }),
      expect.objectContaining({ id: "second", uri: "https://cdn.test/second.jpg", x: 0.51, y: 0.52, width: 0.33, height: 0.34, rotation: 6, zIndex: 7 }),
    ]);
  });

  it("drops planned-photo markers from shared layout JSON", () => {
    const base = {
      role: "viewer" as const,
      title: "Marker",
      travelDate: null,
      pages: [{ position: 0, page: { layout: { aspectRatio: 0.75, elements: [] } } }],
      media: [],
      publishedAt: "2026-08-16T00:00:00Z",
      version: 1,
      cover: null,
    };
    expect(mapSharedAlbumToStoryPages({
      ...base,
      pages: [{ position: 0, page: { layout: { aspectRatio: 0.75, photoPlanVersion: 1, elements: [] } } }],
    })[0].layout).not.toHaveProperty("photoPlanVersion");
    expect(mapSharedAlbumToStoryPages({
      ...base,
      pages: [{ position: 0, page: { layout: { aspectRatio: 0.75, photoPlanVersion: 2, elements: [] } } }],
    })[0].layout).not.toHaveProperty("photoPlanVersion");
  });

  it("falls back to media position order for legacy snapshots", () => {
    const pages = mapSharedAlbumToStoryPages({
      role: "viewer",
      title: "Legacy",
      travelDate: null,
      pages: [
        { position: 0, page: { headline: "First", body: "", layout: { aspectRatio: 0.75, elements: [{ id: "a", type: "image", uri: "file:///a.jpg", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0 }] } } },
        { position: 1, page: { headline: "Second", body: "" } },
      ],
      media: [
        { id: "later", position: 8, contentType: "image/jpeg", byteSize: 1, readUrl: "https://cdn.test/later.jpg" },
        { id: "first", position: 2, contentType: "image/jpeg", byteSize: 1, readUrl: "https://cdn.test/first.jpg" },
      ],
      publishedAt: "2026-08-16T00:00:00.000Z",
      version: 1,
      cover: null,
    });

    expect(pages[0].layout?.elements[0]).toEqual(expect.objectContaining({ uri: "https://cdn.test/first.jpg" }));
    expect(pages[1].photoUri).toBe("https://cdn.test/later.jpg");
  });

  it("resolves the same explicit media id for every duplicated image element", () => {
    const image = (id: string) => ({ id, type: "image" as const, uri: "file:///old.jpg", mediaId: "shared", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0 });
    const pages = mapSharedAlbumToStoryPages({
      role: "editor",
      title: "Repeated reference",
      travelDate: null,
      pages: [{ position: 0, page: { headline: "Page", body: "", layout: { aspectRatio: 0.75, elements: [image("a"), image("b")] } } }],
      media: [
        { id: "shared", position: 0, contentType: "image/jpeg", byteSize: 1, readUrl: "https://cdn.test/shared.jpg" },
        { id: "fallback", position: 1, contentType: "image/jpeg", byteSize: 1, readUrl: "https://cdn.test/fallback.jpg" },
      ],
      publishedAt: "2026-08-16T00:00:00.000Z",
      version: 1,
      cover: null,
    });

    expect(pages[0].layout?.elements).toEqual([
      expect.objectContaining({ id: "a", uri: "https://cdn.test/shared.jpg" }),
      expect.objectContaining({ id: "b", uri: "https://cdn.test/shared.jpg" }),
    ]);
  });

  it("still consumes distinct legacy fallbacks deterministically", () => {
    const image = (id: string) => ({ id, type: "image" as const, uri: "legacy", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0 });
    const pages = mapSharedAlbumToStoryPages({
      role: "viewer", title: "Legacy duplicates", travelDate: null, pages: [{ position: 0, page: { layout: { aspectRatio: 0.75, elements: [image("a"), image("b"), image("c")] } } }],
      media: [
        { id: "one", position: 0, contentType: "image/jpeg", byteSize: 1, readUrl: "https://cdn.test/one.jpg" },
        { id: "two", position: 1, contentType: "image/jpeg", byteSize: 1, readUrl: "https://cdn.test/two.jpg" },
      ], publishedAt: "2026-08-16T00:00:00Z", version: 1, cover: null,
    });
    expect(pages[0].layout?.elements.map((element) => element.type === "image" ? element.uri : null)).toEqual([
      "https://cdn.test/one.jpg", "https://cdn.test/two.jpg", "legacy",
    ]);
  });

  it("restores a stable top-level cover image and preserves a legacy local cover", () => {
    const stable = mapSharedAlbumToStoryPages({
      role: "editor", title: "Top cover", travelDate: null, pages: [{ position: 0, page: { coverImage: "shared-media:cover-media" } }],
      media: [{ id: "cover-media", position: 0, contentType: "image/jpeg", byteSize: 1, readUrl: "https://cdn.test/top.jpg" }],
      publishedAt: "2026-08-16T00:00:00Z", version: 1, cover: null,
    });
    expect(stable[0].coverImage).toBe("https://cdn.test/top.jpg");

    const legacy = mapSharedAlbumToStoryPages({
      role: "viewer", title: "Legacy top cover", travelDate: null, pages: [{ position: 0, page: { coverImage: "file:///legacy-cover.jpg" } }],
      media: [], publishedAt: "2026-08-16T00:00:00Z", version: 1, cover: null,
    });
    expect(legacy[0].coverImage).toBe("file:///legacy-cover.jpg");
  });

  it("never assigns a legacy fallback to a missing explicit stable reference", () => {
    const pages = mapSharedAlbumToStoryPages({
      role: "viewer", title: "Missing ref", travelDate: null, pages: [{ position: 0, page: { layout: { aspectRatio: 0.75, coverImage: "shared-media:missing", elements: [
        { id: "missing", type: "image", uri: "https://expired.test/signed", mediaId: "missing", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0 },
        { id: "legacy", type: "image", uri: "legacy", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 1 },
      ] } } }],
      media: [{ id: "fallback", position: 0, contentType: "image/jpeg", byteSize: 1, readUrl: "https://cdn.test/fallback.jpg" }],
      publishedAt: "2026-08-16T00:00:00Z", version: 1, cover: null,
    });
    expect(pages[0].layout?.coverImage).toBeUndefined();
    expect(pages[0].layout?.elements).toEqual([
      expect.objectContaining({ id: "missing", uri: "" }),
      expect.objectContaining({ id: "legacy", uri: "https://cdn.test/fallback.jpg" }),
    ]);
  });

  it("safely degrades malformed layouts and filters invalid elements", () => {
    const pages = mapSharedAlbumToStoryPages({
      title: "Malformed",
      pages: [
        { position: 0, page: null },
        { position: 1, page: { headline: "Bad layout", layout: { aspectRatio: Number.NaN, elements: [null, 42] } } },
        { position: 2, page: { headline: "Mixed", layout: { aspectRatio: 0.75, backgroundId: "paper", elements: [
          null,
          { id: "bad", type: "image", uri: "old", x: Number.POSITIVE_INFINITY, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0 },
          { id: "good", type: "text", text: "safe", fontStyle: "system", color: "#000", fontSize: 16, x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 1 },
        ] } } },
      ],
      media: [],
      publishedAt: "2026-08-16T00:00:00.000Z",
      version: 1,
      cover: null,
    } as never);

    expect(pages[0]).toEqual(expect.objectContaining({ headline: "", body: "" }));
    expect(pages[1].layout).toBeUndefined();
    expect(pages[2].layout).toEqual(expect.objectContaining({
      aspectRatio: 0.75,
      backgroundId: "paper",
      elements: [expect.objectContaining({ id: "good", text: "safe" })],
    }));
  });

  it("normalizes every shared snapshot page into the same editable canvas shape as a local album", () => {
    const pages = mapSharedAlbumToEditablePages({
      role: "editor",
      title: "Legacy editable album",
      travelDate: null,
      pages: [{ position: 0, page: { id: "legacy-cover", kind: "cover", headline: "封面", body: "", coverColor: "#123456" } }],
      media: [{ id: "cover-photo", position: 0, contentType: "image/jpeg", byteSize: 1, readUrl: "https://cdn.test/legacy.jpg" }],
      publishedAt: "2026-08-16T00:00:00Z",
      version: 1,
      cover: null,
    });

    expect(pages).toEqual([
      expect.objectContaining({
        id: "legacy-cover",
        position: 0,
        layout: expect.objectContaining({
          aspectRatio: 0.75,
          coverColor: "#123456",
          elements: expect.arrayContaining([
            expect.objectContaining({ type: "image", uri: "https://cdn.test/legacy.jpg" }),
            expect.objectContaining({ type: "text", text: "封面" }),
          ]),
        }),
      }),
    ]);
  });

  it("repairs legacy collage rotations only when preparing a shared album for editing", () => {
    const album = {
      role: "editor" as const,
      title: "Legacy shared collage",
      travelDate: null,
      pages: [{ position: 0, page: {
        id: "collage-page",
        kind: "photo",
        layout: {
          aspectRatio: 0.75,
          photoTemplateId: "collage-2",
          elements: [
            { id: "one", type: "image", uri: "", mediaId: "first", x: 0.08, y: 0.11, width: 0.56, height: 0.48, rotation: -3, zIndex: 1 },
            { id: "two", type: "image", uri: "", mediaId: "second", x: 0.38, y: 0.44, width: 0.54, height: 0.45, rotation: 3, zIndex: 2 },
          ],
        },
      } }],
      media: [
        { id: "first", position: 0, contentType: "image/jpeg", byteSize: 1, readUrl: "https://cdn.test/first.jpg" },
        { id: "second", position: 1, contentType: "image/jpeg", byteSize: 1, readUrl: "https://cdn.test/second.jpg" },
      ],
      publishedAt: "2026-08-16T00:00:00Z",
      version: 1,
      cover: null,
    };

    const snapshotImages = mapSharedAlbumToStoryPages(album)[0].layout?.elements
      .filter((element) => element.type === "image") ?? [];
    const editableImages = mapSharedAlbumToEditablePages(album)[0].layout?.elements
      .filter((element) => element.type === "image") ?? [];

    expect(snapshotImages.map((image) => image.rotation)).toEqual([-3, 3]);
    expect(editableImages[0].rotation).toBeCloseTo(-Math.PI / 60);
    expect(editableImages[1].rotation).toBeCloseTo(Math.PI / 60);
    expect(editableImages.map((image) => image.uri)).toEqual([
      "https://cdn.test/first.jpg",
      "https://cdn.test/second.jpg",
    ]);
  });
});
