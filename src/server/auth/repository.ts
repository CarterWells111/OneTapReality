import { and, eq, gt, isNull } from "drizzle-orm";

import type { BackendDatabase } from "../db/client";
import { authEmailCodes, authSessions, users } from "../db/schema";

export type AuthenticatedUser = { id: string; email: string; createdAt: string; lastAuthenticatedAt: string };

export function normalizeAccountEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createOrGetUserByEmail(db: BackendDatabase, email: string, now: string): Promise<AuthenticatedUser> {
  const normalizedEmail = normalizeAccountEmail(email);
  await db.insert(users).values({ id: crypto.randomUUID(), email: normalizedEmail, createdAt: now, lastAuthenticatedAt: now })
    .onConflictDoNothing({ target: users.email });
  const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (!user) throw new Error("User creation did not return a user");
  await db.update(users).set({ lastAuthenticatedAt: now }).where(eq(users.id, user.id));
  return { ...user, lastAuthenticatedAt: now };
}

export async function createAuthEmailCode(
  db: BackendDatabase,
  input: { id: string; email: string; codeHash: string; createdAt: string; expiresAt: string },
) {
  await db.insert(authEmailCodes).values({ ...input, email: normalizeAccountEmail(input.email), consumedAt: null });
}

export async function isAuthEmailCodeRateLimited(db: BackendDatabase, email: string, since: string): Promise<boolean> {
  const recent = await db.select({ id: authEmailCodes.id }).from(authEmailCodes).where(and(
    eq(authEmailCodes.email, normalizeAccountEmail(email)),
    gt(authEmailCodes.createdAt, since),
  )).limit(5);
  return recent.length >= 5;
}

export async function consumeAuthEmailCode(db: BackendDatabase, email: string, codeHash: string, now: string): Promise<boolean> {
  const [code] = await db.select({ id: authEmailCodes.id }).from(authEmailCodes).where(and(
    eq(authEmailCodes.email, normalizeAccountEmail(email)),
    eq(authEmailCodes.codeHash, codeHash),
    isNull(authEmailCodes.consumedAt),
    gt(authEmailCodes.expiresAt, now),
  )).limit(1);
  if (!code) return false;
  const consumed = await db.update(authEmailCodes).set({ consumedAt: now }).where(and(eq(authEmailCodes.id, code.id), isNull(authEmailCodes.consumedAt))).returning({ id: authEmailCodes.id });
  return consumed.length === 1;
}

export async function createAuthSession(
  db: BackendDatabase,
  input: { id: string; userId: string; tokenHash: string; createdAt: string; expiresAt: string },
) {
  await db.insert(authSessions).values({ ...input, revokedAt: null });
}

export async function getAuthenticatedUserByTokenHash(db: BackendDatabase, tokenHash: string, now: string): Promise<AuthenticatedUser | null> {
  const [row] = await db.select({ id: users.id, email: users.email, createdAt: users.createdAt, lastAuthenticatedAt: users.lastAuthenticatedAt })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(and(eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, now)))
    .limit(1);
  return row ?? null;
}

export async function revokeAuthSessionByTokenHash(db: BackendDatabase, tokenHash: string, revokedAt: string): Promise<boolean> {
  const revoked = await db.update(authSessions).set({ revokedAt }).where(and(eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt))).returning({ id: authSessions.id });
  return revoked.length === 1;
}
