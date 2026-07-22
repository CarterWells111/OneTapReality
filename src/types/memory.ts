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
};

export type Memory = MemoryDraftInput & {
  id: string;
  status?: MemoryStatus;
  pages: StoryPage[];
  createdAt: string;
  updatedAt: string;
};

