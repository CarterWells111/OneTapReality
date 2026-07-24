import { canvasFontOptions } from "../typography/fonts";
import {
  localBackgrounds,
  getLocalStickers,
  localFrames,
  localStickerCategories,
  localStickers,
  type LocalStickerCategory,
} from "./local-canvas-assets";
import type { CanvasBackgroundId, CanvasFontStyle, CanvasStickerId } from "../../types/memory";

export type CanvasStickerCategory = LocalStickerCategory;

export const canvasFonts: readonly { id: CanvasFontStyle; label: string; family: string }[] = canvasFontOptions;

export const canvasStickerCategories = localStickerCategories;

export const canvasStickers: readonly {
  id: CanvasStickerId;
  label: string;
  category: Exclude<CanvasStickerCategory, "all">;
  source: (typeof localStickers)[number]["source"];
}[] = localStickers;

export const canvasFrames = localFrames;

export const canvasBackgrounds: readonly {
  id: CanvasBackgroundId;
  label: string;
  source: (typeof localBackgrounds)[number]["source"];
}[] = localBackgrounds;

export function getCanvasStickers(category: CanvasStickerCategory) {
  return getLocalStickers(category);
}
