import {
  mapSharedAlbumToEditablePages,
  mapSharedAlbumToStoryPages,
} from "../src/features/gifts/shared-album-mapper";

describe("shared album snapshot mapper", () => {
  it("prefers stable media references and preserves the complete canvas page", () => {
    const pages = mapSharedAlbumToStoryPages({
      role: "editor",
      title: "Trip",
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
            backgroundId: "paper-grid",
            coverColor: "#abcdef",
            coverImage: "shared-media:media-1",
            elements: [
              { id: "second", type: "image", uri: "file:///old.jpg", mediaId: "media-2", x: 0.1, y: 0.2, width: 0.3, height: 0.4, rotation: 5, zIndex: 2 },
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
        backgroundId: "paper-grid",
        coverColor: "#abcdef",
        coverImage: "https://cdn.test/first.jpg",
        elements: [
          expect.objectContaining({ id: "second", uri: "https://cdn.test/second.jpg", rotation: 5, zIndex: 2 }),
          expect.objectContaining({ id: "caption", text: "Keep me", color: "#fedcba", fontSize: 18 }),
        ],
      }),
    })]);
    expect(pages[0]).not.toHaveProperty("token");
  });

  it("falls back to media position order for legacy snapshots", () => {
    const pages = mapSharedAlbumToStoryPages({
      role: "viewer",
      title: "Legacy",
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
      role: "viewer", title: "Legacy duplicates", pages: [{ position: 0, page: { layout: { aspectRatio: 0.75, elements: [image("a"), image("b"), image("c")] } } }],
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
      role: "editor", title: "Top cover", pages: [{ position: 0, page: { coverImage: "shared-media:cover-media" } }],
      media: [{ id: "cover-media", position: 0, contentType: "image/jpeg", byteSize: 1, readUrl: "https://cdn.test/top.jpg" }],
      publishedAt: "2026-08-16T00:00:00Z", version: 1, cover: null,
    });
    expect(stable[0].coverImage).toBe("https://cdn.test/top.jpg");

    const legacy = mapSharedAlbumToStoryPages({
      role: "viewer", title: "Legacy top cover", pages: [{ position: 0, page: { coverImage: "file:///legacy-cover.jpg" } }],
      media: [], publishedAt: "2026-08-16T00:00:00Z", version: 1, cover: null,
    });
    expect(legacy[0].coverImage).toBe("file:///legacy-cover.jpg");
  });

  it("never assigns a legacy fallback to a missing explicit stable reference", () => {
    const pages = mapSharedAlbumToStoryPages({
      role: "viewer", title: "Missing ref", pages: [{ position: 0, page: { layout: { aspectRatio: 0.75, coverImage: "shared-media:missing", elements: [
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
});
