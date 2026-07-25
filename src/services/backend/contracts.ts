export const backendContractVersion = 1 as const;

export const cloudCities = ["hangzhou", "shanghai", "shenzhen"] as const;
export type CloudCity = (typeof cloudCities)[number];

export const cloudMemoryStatuses = ["draft", "saved", "discarded"] as const;
export type CloudMemoryStatus = (typeof cloudMemoryStatuses)[number];

type CloudCanvasElementBase = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
};

export type CloudImageElement = CloudCanvasElementBase & {
  type: "image";
  photoSlot: number;
};

export type CloudTextElement = CloudCanvasElementBase & {
  type: "text";
  text: string;
  fontStyle: "system" | "avenir" | "georgia";
  color: string;
};

export type CloudStickerElement = CloudCanvasElementBase & {
  type: "sticker";
  stickerId: string;
};

export type CloudCanvasElement = CloudImageElement | CloudTextElement | CloudStickerElement;

export type CloudCanvasLayout = {
  aspectRatio: number;
  elements: CloudCanvasElement[];
};

export type CloudStoryPage = {
  id: string;
  position: number;
  kind: "cover" | "photo" | "closing";
  headline: string;
  body: string;
  photoSlot?: number;
  layout?: CloudCanvasLayout;
};

export type CloudMemoryPayload = {
  title: string;
  city: CloudCity;
  travelDate: string;
  status: CloudMemoryStatus;
  photoCount: number;
  pages: CloudStoryPage[];
};

export type CloudMemory = CloudMemoryPayload & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type HealthResponse = {
  service: "adventurex-api";
  contractVersion: typeof backendContractVersion;
  database: "ok";
};

export type CapabilitiesResponse = {
  contractVersion: typeof backendContractVersion;
  features: {
    deviceRegistration: boolean;
    memoryCrud: boolean;
    automaticSync: boolean;
    photoUpload: boolean;
  };
};

export type DeviceRegistrationResponse = {
  contractVersion: typeof backendContractVersion;
  deviceId: string;
  accessToken: string;
};

export type BackendErrorBody = {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
};
