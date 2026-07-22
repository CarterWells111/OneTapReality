import type { CanvasElement, CanvasLayout, StoryPage } from "../../types/memory";

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

export function normalizeLayout(layout: CanvasLayout): CanvasLayout {
  const ids = new Map<string, number>();
  return {
    aspectRatio: 1,
    elements: layout.elements.map((element) => {
      const occurrence = (ids.get(element.id) ?? 0) + 1;
      ids.set(element.id, occurrence);
      return {
        ...element,
        id: occurrence === 1 ? element.id : `${element.id}-${occurrence}`,
        x: clamp(element.x, 0, 1),
        y: clamp(element.y, 0, 1),
        width: clamp(element.width, 0.05, 1),
        height: clamp(element.height, 0.05, 1),
      } as CanvasElement;
    }),
  };
}

export function createLegacyLayout(page: Omit<StoryPage, "layout">): CanvasLayout {
  const elements: CanvasElement[] = [];
  if (page.photoUri) {
    elements.push({ id: `${page.id}:image`, type: "image", uri: page.photoUri, x: 0.08, y: 0.08, width: 0.84, height: 0.48, rotation: 0, zIndex: 1 });
  }
  elements.push(
    { id: `${page.id}:headline`, type: "text", text: page.headline, fontStyle: "avenir", color: "#24312B", x: 0.1, y: page.photoUri ? 0.62 : 0.24, width: 0.8, height: 0.12, rotation: 0, zIndex: 2 },
    { id: `${page.id}:body`, type: "text", text: page.body, fontStyle: "system", color: "#69756E", x: 0.1, y: page.photoUri ? 0.78 : 0.42, width: 0.8, height: 0.14, rotation: 0, zIndex: 3 }
  );
  return { aspectRatio: 1, elements };
}
