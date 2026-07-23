import type { CanvasFontStyle, CanvasStickerId } from "../../types/memory";

export type CanvasStickerCategory = "all" | "emotion" | "travel" | "daily" | "nature";

export const canvasFonts: readonly { id: CanvasFontStyle; label: string; family: string }[] = [
  { id: "system", label: "简洁", family: "System" },
  { id: "avenir", label: "现代", family: "Avenir Next" },
  { id: "georgia", label: "手账", family: "Georgia" },
];

export const canvasStickerCategories: readonly { id: CanvasStickerCategory; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "emotion", label: "情感" },
  { id: "travel", label: "旅行" },
  { id: "daily", label: "日常" },
  { id: "nature", label: "自然" },
];

export const canvasStickers: readonly {
  id: CanvasStickerId;
  glyph: string;
  label: string;
  category: Exclude<CanvasStickerCategory, "all">;
}[] = [
  { id: "heart", glyph: "❤️", label: "心意", category: "emotion" },
  { id: "sparkles", glyph: "✨", label: "闪光", category: "emotion" },
  { id: "love-letter", glyph: "💌", label: "信件", category: "emotion" },
  { id: "camera", glyph: "📷", label: "相机", category: "travel" },
  { id: "suitcase", glyph: "🧳", label: "行李", category: "travel" },
  { id: "map", glyph: "🗺️", label: "地图", category: "travel" },
  { id: "pin", glyph: "📍", label: "地点", category: "travel" },
  { id: "ticket", glyph: "🎟️", label: "票根", category: "travel" },
  { id: "coffee", glyph: "☕", label: "咖啡", category: "daily" },
  { id: "flower", glyph: "🌼", label: "花朵", category: "nature" },
  { id: "sun", glyph: "☀️", label: "晴天", category: "nature" },
  { id: "moon", glyph: "🌙", label: "月亮", category: "nature" },
];

export function getCanvasStickers(category: CanvasStickerCategory) {
  return category === "all"
    ? canvasStickers
    : canvasStickers.filter((sticker) => sticker.category === category);
}
