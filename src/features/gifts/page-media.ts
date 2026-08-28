import type { CanvasImageElement, StoryPage } from "../../types/memory";

export function pageImageUris(page: StoryPage): string[] {
  const layoutImages = page.layout?.elements.filter((element) => element.type === "image") ?? [];
  const layoutUris = layoutImages
    .filter((element): element is CanvasImageElement => Boolean(element.uri))
    .map((element) => element.uri) ?? [];
  const uris = layoutImages.length > 0 ? layoutUris : page.photoUri ? [page.photoUri] : [];
  return [...new Set(uris)];
}

export function collectMemoryImageUris(pages: StoryPage[]): string[] {
  return [...new Set(pages.flatMap(pageImageUris))];
}
