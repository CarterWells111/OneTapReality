import type { CanvasImageElement, CanvasLayout } from "../../types/memory";

const slots = {
  1: [[0.08, 0.08, 0.84, 0.84]],
  2: [[0.08, 0.08, 0.84, 0.4], [0.08, 0.52, 0.84, 0.4]],
  3: [[0.08, 0.08, 0.84, 0.46], [0.08, 0.58, 0.4, 0.34], [0.52, 0.58, 0.4, 0.34]],
} as const;

export function createPhotoLayout(photoUris: string[]): CanvasLayout {
  const positions = photoUris.length <= 3
    ? slots[Math.max(photoUris.length, 1) as 1 | 2 | 3]
    : photoUris.map((_, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const rowCount = Math.ceil(photoUris.length / 2);
      const gap = 0.04;
      const height = (0.84 - gap * (rowCount - 1)) / rowCount;
      return [0.08 + column * 0.43, 0.08 + row * (height + gap), 0.4, height] as const;
    });
  const elements: CanvasImageElement[] = photoUris.map((uri, index) => {
    const [x, y, width, height] = positions[index];
    return { id: `image-${index + 1}`, type: "image", uri, x, y, width, height, rotation: 0, zIndex: index + 1 };
  });
  return { aspectRatio: 1, elements };
}
