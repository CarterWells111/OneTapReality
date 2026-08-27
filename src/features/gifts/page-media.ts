import type { StoryPage } from "../../types/memory";

export function pageImageUris(page: StoryPage): string[] {
  const uris: string[] = [];
  if (page.photoUri) uris.push(page.photoUri);
  page.layout?.elements.forEach((element) => {
    if (element.type === "image" && element.uri) uris.push(element.uri);
  });
  return [...new Set(uris)];
}

export function collectMemoryImageUris(pages: StoryPage[]): string[] {
  return [...new Set(pages.flatMap(pageImageUris))];
}
