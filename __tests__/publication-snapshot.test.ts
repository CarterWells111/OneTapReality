import {
  PublicationSnapshotError,
  collectPublicationSources,
  snapshotPagesForPublication,
} from "../src/features/gifts/publication-snapshot";
import type { StoryPage } from "../src/types/memory";

const image = (id: string, uri: string, zIndex = 0) => ({
  id,
  type: "image" as const,
  uri,
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  rotation: 0,
  zIndex,
});

describe("gift publication snapshots", () => {
  it("collects every image source once in stable page order", () => {
    const pages: StoryPage[] = [{
      id: "cover",
      position: 0,
      kind: "cover",
      headline: "Trip",
      body: "",
      photoUri: "file:///legacy.jpg",
      coverImage: "file:///top.jpg",
      layout: {
        aspectRatio: 0.75,
        coverImage: "file:///layout-cover.jpg",
        elements: [
          image("a", "file:///a.jpg"),
          image("again", "file:///a.jpg", 1),
        ],
      },
    }];

    expect(collectPublicationSources(pages).map((source) => source.uri)).toEqual([
      "file:///legacy.jpg",
      "file:///top.jpg",
      "file:///layout-cover.jpg",
      "file:///a.jpg",
    ]);
  });

  it("replaces local references without persisting source or signed URLs", () => {
    const pages: StoryPage[] = [{
      id: "cover",
      position: 0,
      kind: "cover",
      headline: "Trip",
      body: "",
      coverImage: "file:///top.jpg",
      layout: {
        aspectRatio: 0.75,
        coverImage: "https://signed.test/layout-cover.jpg",
        elements: [
          image("a", "file:///a.jpg"),
          image("again", "file:///a.jpg", 1),
        ],
      },
    }];
    const references = [
      { uri: "file:///top.jpg", position: 0 },
      { uri: "https://signed.test/layout-cover.jpg", position: 1, existingId: "layout-id" },
      { uri: "file:///a.jpg", position: 2 },
    ];

    const snapshot = snapshotPagesForPublication(pages, references);

    expect(JSON.stringify(snapshot)).not.toMatch(/file:\/\/|ph:\/\/|https:\/\/|data:image/);
    expect(snapshot[0].page.coverImage).toBe("shared-position:0");
    expect((snapshot[0].page.layout as Record<string, unknown>).coverImage).toBe("shared-media:layout-id");
    const elements = (snapshot[0].page.layout as { elements: Record<string, unknown>[] }).elements;
    expect(elements[0]).toEqual(expect.objectContaining({ uri: "", mediaPosition: 2 }));
    expect(elements[1]).toEqual(expect.objectContaining({ uri: "", mediaPosition: 2 }));
  });

  it("maps signed read URLs back to existing media ids", () => {
    const uri = "https://signed.test/existing.jpg?signature=secret";
    const pages: StoryPage[] = [{
      id: "page",
      position: 0,
      kind: "photo",
      headline: "",
      body: "",
      coverImage: uri,
      layout: { aspectRatio: 0.75, elements: [image("existing", uri)] },
    }];

    expect(collectPublicationSources(pages, new Map([[uri, { id: "media-7" }]]))).toEqual([
      { uri, existingId: "media-7" },
    ]);
    const snapshot = snapshotPagesForPublication(pages, [{ uri, position: 4, existingId: "media-7" }]);
    expect(snapshot[0].page.coverImage).toBe("shared-media:media-7");
    expect((snapshot[0].page.layout as { elements: Record<string, unknown>[] }).elements[0]).toEqual(
      expect.objectContaining({ uri: "", mediaId: "media-7", mediaPosition: 4 }),
    );
  });

  it("replaces a mapped legacy photoUri with its stable reference and rejects every unmapped reference", () => {
    const legacy: StoryPage = {
      id: "legacy",
      position: 0,
      kind: "photo",
      headline: "",
      body: "",
      photoUri: "ph://legacy",
    };
    const snapshot = snapshotPagesForPublication([legacy], [{ uri: "ph://legacy", position: 0 }]);
    expect(snapshot[0].page.photoUri).toBe("shared-position:0");

    const existingSnapshot = snapshotPagesForPublication([legacy], [{ uri: "ph://legacy", position: 4, existingId: "media-7" }]);
    expect(existingSnapshot[0].page.photoUri).toBe("shared-media:media-7");

    expect(() => snapshotPagesForPublication([legacy], [])).toThrow(PublicationSnapshotError);
    expect(() => snapshotPagesForPublication([legacy], [])).toThrow(/legacy/);
  });
});
