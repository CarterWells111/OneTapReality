import type { City } from "./city";

export { cities, type City } from "./city";

export const memoryStatuses = ["draft", "saved", "discarded"] as const;

export type MemoryStatus = (typeof memoryStatuses)[number];

export type MemoryDraftInput = {
  title: string;
  city: City;
  travelDate: string;
  photoUris: string[];
  /** 封面颜色（十六进制）。为空时回退到城市默认色。 */
  coverColor?: string;
};

export type StoryPage = {
  id: string;
  position: number;
  kind: "cover" | "photo" | "closing";
  headline: string;
  body: string;
  photoUri?: string;
  layout?: CanvasLayout;
};

export type CanvasFontStyle = string;
export type CanvasStickerId = string;
export type CanvasFrameId = string;
export type CanvasBackgroundId = string;

type CanvasElementBase = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
};

export type CanvasImageElement = CanvasElementBase & {
  type: "image";
  uri: string;
};

export type CanvasTextElement = CanvasElementBase & {
  type: "text";
  text: string;
  fontStyle: CanvasFontStyle;
  color: string;
  fontSize: number;
};

export type CanvasStickerElement = CanvasElementBase & {
  type: "sticker";
  stickerId: CanvasStickerId;
};

export type CanvasFrameElement = CanvasElementBase & {
  type: "frame";
  frameId: CanvasFrameId;
};

export type CanvasElement =
  | CanvasImageElement
  | CanvasTextElement
  | CanvasStickerElement
  | CanvasFrameElement;

export type CanvasLayout = {
  aspectRatio: 1;
  backgroundId?: CanvasBackgroundId;
  elements: CanvasElement[];
};

export type Memory = MemoryDraftInput & {
  id: string;
  status?: MemoryStatus;
  pages: StoryPage[];
  createdAt: string;
  updatedAt: string;
};

