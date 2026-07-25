import { z } from "zod";

import { cloudCities, cloudMemoryStatuses, type CloudMemoryPayload } from "../services/backend/contracts";

const canvasElementBase = {
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number(),
  zIndex: z.number().int(),
};

const canvasElement = z.discriminatedUnion("type", [
  z.object({ ...canvasElementBase, type: z.literal("image"), photoSlot: z.number().int().nonnegative() }).strict(),
  z.object({
    ...canvasElementBase,
    type: z.literal("text"),
    text: z.string(),
    fontStyle: z.enum(["system", "avenir", "georgia"]),
    color: z.string().min(1),
  }).strict(),
  z.object({ ...canvasElementBase, type: z.literal("sticker"), stickerId: z.string().min(1) }).strict(),
]);

export const cloudMemoryPayloadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  city: z.enum(cloudCities),
  travelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(cloudMemoryStatuses),
  photoCount: z.number().int().min(0).max(500),
  pages: z.array(z.object({
    id: z.string().min(1),
    position: z.number().int().nonnegative(),
    kind: z.enum(["cover", "photo", "closing"]),
    headline: z.string().max(500),
    body: z.string().max(10000),
    photoSlot: z.number().int().nonnegative().optional(),
    layout: z.object({
      aspectRatio: z.number(),
      elements: z.array(canvasElement).max(100),
    }).strict().optional(),
  }).strict()).max(100),
}).strict();

export function parseCloudMemoryPayload(input: unknown): CloudMemoryPayload {
  return cloudMemoryPayloadSchema.parse(input) as CloudMemoryPayload;
}

export function parseInstallationId(input: unknown): string {
  return z.object({ installationId: z.string().min(16).max(200) }).strict().parse(input).installationId;
}
