import type { StoryPage } from "../../types/memory";

export type PublicationSource = {
  uri: string;
  existingId?: string;
};

export type PublicationReference = PublicationSource & {
  position: number;
};

export class PublicationSnapshotError extends Error {
  readonly pageId: string;
  readonly uri: string;

  constructor(pageId: string, uri: string) {
    super(`Page ${pageId} has an unmapped publication image: ${uri}`);
    this.name = "PublicationSnapshotError";
    this.pageId = pageId;
    this.uri = uri;
  }
}

function pageImageUris(page: StoryPage) {
  const uris: string[] = [];
  if (page.photoUri) uris.push(page.photoUri);
  if (page.coverImage) uris.push(page.coverImage);
  if (page.layout?.coverImage) uris.push(page.layout.coverImage);
  page.layout?.elements.forEach((element) => {
    if (element.type === "image" && element.uri) uris.push(element.uri);
  });
  return uris;
}

export function collectPublicationSources(
  pages: StoryPage[],
  existingByUri: ReadonlyMap<string, { id: string }> = new Map(),
): PublicationSource[] {
  const sources: PublicationSource[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    for (const uri of pageImageUris(page)) {
      if (seen.has(uri)) continue;
      seen.add(uri);
      const existing = existingByUri.get(uri);
      sources.push(existing ? { uri, existingId: existing.id } : { uri });
    }
  }
  return sources;
}

function stableReference(reference: PublicationReference) {
  return reference.existingId
    ? `shared-media:${reference.existingId}`
    : `shared-position:${reference.position}`;
}

export function snapshotPagesForPublication(
  pages: StoryPage[],
  references: PublicationReference[],
): { position: number; page: Record<string, unknown> }[] {
  const byUri = new Map(references.map((reference) => [reference.uri, reference]));

  const requireReference = (page: StoryPage, uri: string) => {
    const reference = byUri.get(uri);
    if (!reference) throw new PublicationSnapshotError(page.id, uri);
    return reference;
  };

  return pages.map((page, position) => {
    if (page.photoUri) requireReference(page, page.photoUri);
    const { photoUri: _photoUri, coverImage, layout, ...safePage } = page;
    const snapshot: Record<string, unknown> = {
      ...safePage,
      ...(coverImage ? { coverImage: stableReference(requireReference(page, coverImage)) } : {}),
    };

    if (layout) {
      const { photoPlanVersion: _photoPlanVersion, ...shareableLayout } = layout;
      snapshot.layout = {
        ...shareableLayout,
        ...(shareableLayout.coverImage
          ? { coverImage: stableReference(requireReference(page, shareableLayout.coverImage)) }
          : {}),
        elements: shareableLayout.elements.map((element) => {
          if (element.type !== "image" || !element.uri) return { ...element };
          const reference = requireReference(page, element.uri);
          return {
            ...element,
            uri: "",
            ...(reference.existingId ? { mediaId: reference.existingId } : {}),
            mediaPosition: reference.position,
          };
        }),
      };
    }

    return { position, page: snapshot };
  });
}
