import { and, asc, desc, eq } from "drizzle-orm";

import type { CloudMemory, CloudMemoryPayload } from "../../services/backend/contracts";
import { parseCloudMemoryPayload } from "../validation";
import type { BackendDatabase } from "../db/client";
import { devices, memories, memoryPages } from "../db/schema";

function buildId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function createDevice(
  db: BackendDatabase,
  input: { id: string; installationId: string; tokenHash: string; createdAt: string },
) {
  await db.insert(devices).values(input);
  return input;
}

export async function getDeviceByInstallationId(db: BackendDatabase, installationId: string) {
  const [device] = await db.select().from(devices).where(eq(devices.installationId, installationId)).limit(1);
  return device;
}

export async function rotateDeviceToken(
  db: BackendDatabase,
  deviceId: string,
  tokenHash: string,
) {
  await db.update(devices).set({ tokenHash, revokedAt: null }).where(eq(devices.id, deviceId));
}

async function hydrateMemory(db: BackendDatabase, row: typeof memories.$inferSelect): Promise<CloudMemory> {
  const pageRows = await db.select().from(memoryPages).where(eq(memoryPages.memoryId, row.id)).orderBy(asc(memoryPages.position));
  const payload = parseCloudMemoryPayload({
    title: row.title,
    city: row.city,
    travelDate: row.travelDate,
    status: row.status,
    photoCount: row.photoCount,
    pages: pageRows.map((page) => ({
      id: page.id,
      position: page.position,
      kind: page.kind,
      headline: page.headline,
      body: page.body,
      ...(page.photoSlot === null ? {} : { photoSlot: page.photoSlot }),
      ...(page.layoutJson ? { layout: page.layoutJson } : {}),
    })),
  });
  return { ...payload, id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

async function insertPages(db: Pick<BackendDatabase, "insert">, memoryId: string, pages: CloudMemoryPayload["pages"]) {
  if (pages.length === 0) return;
  await db.insert(memoryPages).values(pages.map((page) => ({
    id: page.id,
    memoryId,
    position: page.position,
    kind: page.kind,
    headline: page.headline,
    body: page.body,
    photoSlot: page.photoSlot ?? null,
    layoutJson: page.layout ?? null,
  })));
}

export async function createMemory(
  db: BackendDatabase,
  deviceId: string,
  input: CloudMemoryPayload,
): Promise<CloudMemory> {
  const payload = parseCloudMemoryPayload(input);
  const id = buildId("memory");
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx.insert(memories).values({
      id,
      deviceId,
      title: payload.title,
      city: payload.city,
      travelDate: payload.travelDate,
      status: payload.status,
      photoCount: payload.photoCount,
      createdAt: now,
      updatedAt: now,
    });
    await insertPages(tx, id, payload.pages);
  });
  return { ...payload, id, createdAt: now, updatedAt: now };
}

export async function listMemories(db: BackendDatabase, deviceId: string): Promise<CloudMemory[]> {
  const rows = await db.select().from(memories).where(eq(memories.deviceId, deviceId)).orderBy(desc(memories.updatedAt));
  return Promise.all(rows.map((row) => hydrateMemory(db, row)));
}

export async function getMemory(db: BackendDatabase, deviceId: string, memoryId: string): Promise<CloudMemory | null> {
  const [row] = await db.select().from(memories)
    .where(and(eq(memories.id, memoryId), eq(memories.deviceId, deviceId)))
    .limit(1);
  return row ? hydrateMemory(db, row) : null;
}

export async function updateMemory(
  db: BackendDatabase,
  deviceId: string,
  memoryId: string,
  input: CloudMemoryPayload,
): Promise<CloudMemory | null> {
  const [existing] = await db.select().from(memories)
    .where(and(eq(memories.id, memoryId), eq(memories.deviceId, deviceId)))
    .limit(1);
  if (!existing) return null;
  const payload = parseCloudMemoryPayload(input);
  const updatedAt = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx.update(memories).set({
      title: payload.title,
      city: payload.city,
      travelDate: payload.travelDate,
      status: payload.status,
      photoCount: payload.photoCount,
      updatedAt,
    }).where(eq(memories.id, memoryId));
    await tx.delete(memoryPages).where(eq(memoryPages.memoryId, memoryId));
    await insertPages(tx, memoryId, payload.pages);
  });
  return { ...payload, id: memoryId, createdAt: existing.createdAt, updatedAt };
}

export async function deleteMemory(db: BackendDatabase, deviceId: string, memoryId: string): Promise<boolean> {
  const deleted = await db.delete(memories)
    .where(and(eq(memories.id, memoryId), eq(memories.deviceId, deviceId)))
    .returning({ id: memories.id });
  return deleted.length > 0;
}
