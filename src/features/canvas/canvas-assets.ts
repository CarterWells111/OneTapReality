import type { CanvasFontStyle, CanvasStickerId } from "../../types/memory";

export const canvasFonts: readonly { id: CanvasFontStyle; label: string; family: string }[] = [
  { id: "system", label: "简洁", family: "System" },
  { id: "avenir", label: "现代", family: "Avenir Next" },
  { id: "georgia", label: "手账", family: "Georgia" },
];

export const canvasStickers: readonly { id: CanvasStickerId; glyph: string; label: string }[] = [
  { id: "heart", glyph: "❤️", label: "心意" }, { id: "sparkles", glyph: "✨", label: "闪光" }, { id: "camera", glyph: "📷", label: "相机" }, { id: "suitcase", glyph: "🧳", label: "行李" },
  { id: "map", glyph: "🗺️", label: "地图" }, { id: "pin", glyph: "📍", label: "地点" }, { id: "coffee", glyph: "☕", label: "咖啡" }, { id: "flower", glyph: "🌼", label: "花朵" },
  { id: "ticket", glyph: "🎟️", label: "票根" }, { id: "sun", glyph: "☀️", label: "晴天" }, { id: "moon", glyph: "🌙", label: "月亮" }, { id: "love-letter", glyph: "💌", label: "信件" },
];
