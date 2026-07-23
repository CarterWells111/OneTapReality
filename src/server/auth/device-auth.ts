import { and, eq, isNull } from "drizzle-orm";

import type { BackendDatabase } from "../db/client";
import { devices } from "../db/schema";

export type AuthenticatedDevice = {
  deviceId: string;
  tokenHash: string;
};

function toBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

export function createAccessToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export function extractBearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/iu);
  return match?.[1] ?? null;
}

export async function hashAccessToken(token: string, pepper: string): Promise<string> {
  const data = new TextEncoder().encode(`${pepper}:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function authenticateRequest(
  request: Request,
  db: BackendDatabase,
): Promise<AuthenticatedDevice | null> {
  const token = extractBearerToken(request.headers.get("Authorization"));
  const pepper = process.env.DEVICE_TOKEN_PEPPER;
  if (!token || !pepper) {
    return null;
  }

  const tokenHash = await hashAccessToken(token, pepper);
  const [device] = await db.select().from(devices)
    .where(and(eq(devices.tokenHash, tokenHash), isNull(devices.revokedAt)))
    .limit(1);
  if (!device) {
    return null;
  }

  await db.update(devices).set({ lastSeenAt: new Date().toISOString() }).where(eq(devices.id, device.id));
  return { deviceId: device.id, tokenHash };
}
