export const cities = ["hangzhou", "shanghai", "shenzhen"] as const;

export type City = (typeof cities)[number];

export const memoryStatuses = ["draft", "saved", "discarded"] as const;

export type MemoryStatus = (typeof memoryStatuses)[number];

export type MemoryDraftInput = {
  title: string;
  city: City;
  travelDate: string;
  photoUris: string[];
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

export type CanvasFontStyle = "system" | "avenir" | "georgia";
export type CanvasStickerId =
  | "heart"
  | "sparkles"
  | "camera"
  | "suitcase"
  | "map"
  | "pin"
  | "coffee"
  | "flower"
  | "ticket"
  | "sun"
  | "moon"
  | "love-letter";

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
};

export type CanvasStickerElement = CanvasElementBase & {
  type: "sticker";
  stickerId: CanvasStickerId;
};

export type CanvasElement =
  | CanvasImageElement
  | CanvasTextElement
  | CanvasStickerElement;

export type CanvasLayout = {
  aspectRatio: 1;
  elements: CanvasElement[];
};

export type Memory = MemoryDraftInput & {
  id: string;
  status?: MemoryStatus;
  pages: StoryPage[];
  createdAt: string;
  updatedAt: string;
};

