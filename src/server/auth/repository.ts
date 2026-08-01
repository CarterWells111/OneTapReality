import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";

import type { BackendDatabase } from "../db/client";
import { authEmailCodes, authRateLimits, authSessions, users } from "../db/schema";

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
  const email = normalizeAccountEmail(input.email);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('auth-email-code'), hashtext(${email}))`);
    await tx.update(authEmailCodes).set({ consumedAt: input.createdAt }).where(and(
      eq(authEmailCodes.email, email),
      isNull(authEmailCodes.consumedAt),
    ));
    await tx.insert(authEmailCodes).values({ ...input, email, consumedAt: null, failedAttempts: 0 });
  });
}

export async function deleteAuthEmailCodeById(db: BackendDatabase, id: string): Promise<void> {
  await db.delete(authEmailCodes).where(eq(authEmailCodes.id, id));
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
    lt(authEmailCodes.failedAttempts, 5),
    gt(authEmailCodes.expiresAt, now),
  )).limit(1);
  if (!code) return false;
  const consumed = await db.update(authEmailCodes).set({ consumedAt: now }).where(and(eq(authEmailCodes.id, code.id), isNull(authEmailCodes.consumedAt))).returning({ id: authEmailCodes.id });
  return consumed.length === 1;
}

type VerifyAccountEmailCodeInput = {
  email: string;
  codeHash: string;
  now: string;
  ipScopeHash: string;
  ipWindowStartedAt: string;
  ipExpiresAt: string;
  session: { id: string; tokenHash: string; createdAt: string; expiresAt: string };
};

export type VerifyAccountEmailCodeResult =
  | { status: "success"; user: AuthenticatedUser }
  | { status: "invalid" }
  | { status: "rate_limited" };

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export async function verifyAccountEmailCode(
  db: BackendDatabase,
  input: VerifyAccountEmailCodeInput,
): Promise<VerifyAccountEmailCodeResult> {
  const email = normalizeAccountEmail(input.email);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('auth-ip-rate'), hashtext(${input.ipScopeHash}))`);
    const [rateLimit] = await tx.select().from(authRateLimits)
      .where(and(eq(authRateLimits.scopeHash, input.ipScopeHash), gt(authRateLimits.expiresAt, input.now)))
      .limit(1)
      .for("update");
    if (rateLimit && rateLimit.attempts >= 20) return { status: "rate_limited" as const };

    const [code] = await tx.select().from(authEmailCodes).where(and(
      eq(authEmailCodes.email, email),
      isNull(authEmailCodes.consumedAt),
      gt(authEmailCodes.expiresAt, input.now),
    )).orderBy(desc(authEmailCodes.createdAt)).limit(1).for("update");

    if (!code || code.failedAttempts >= 5 || !constantTimeEqual(code.codeHash, input.codeHash)) {
      if (code && code.failedAttempts < 5) {
        await tx.update(authEmailCodes).set({ failedAttempts: sql`${authEmailCodes.failedAttempts} + 1` })
          .where(and(eq(authEmailCodes.id, code.id), lt(authEmailCodes.failedAttempts, 5)));
      }
      await tx.insert(authRateLimits).values({
        scopeHash: input.ipScopeHash,
        windowStartedAt: input.ipWindowStartedAt,
        attempts: 1,
        expiresAt: input.ipExpiresAt,
      }).onConflictDoUpdate({
        target: authRateLimits.scopeHash,
        set: { attempts: sql`${authRateLimits.attempts} + 1` },
      });
      return { status: "invalid" as const };
    }

    const consumed = await tx.update(authEmailCodes).set({ consumedAt: input.now }).where(and(
      eq(authEmailCodes.id, code.id),
      isNull(authEmailCodes.consumedAt),
      lt(authEmailCodes.failedAttempts, 5),
    )).returning({ id: authEmailCodes.id });
    if (consumed.length !== 1) return { status: "invalid" as const };

    await tx.insert(users).values({ id: crypto.randomUUID(), email, createdAt: input.now, lastAuthenticatedAt: input.now })
      .onConflictDoNothing({ target: users.email });
    const [user] = await tx.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) throw new Error("User creation did not return a user");
    await tx.update(users).set({ lastAuthenticatedAt: input.now }).where(eq(users.id, user.id));
    await tx.insert(authSessions).values({ ...input.session, userId: user.id, revokedAt: null });
    return { status: "success" as const, user: { ...user, lastAuthenticatedAt: input.now } };
  });
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

export async function purgeAuthTechnicalData(
  db: BackendDatabase,
  input: { codeCutoff: string; sessionCutoff: string; rateLimitCutoff: string; limit: number },
): Promise<{ codes: number; sessions: number; rateLimits: number }> {
  const limit = Math.max(1, Math.min(input.limit, 100));
  const codeIds = await db.select({ id: authEmailCodes.id }).from(authEmailCodes)
    .where(lte(authEmailCodes.createdAt, input.codeCutoff)).limit(limit);
  const sessionIds = await db.select({ id: authSessions.id }).from(authSessions).where(or(
    lte(authSessions.expiresAt, input.sessionCutoff),
    and(isNotNull(authSessions.revokedAt), lte(authSessions.revokedAt, input.sessionCutoff)),
  )).limit(limit);
  const rateLimitIds = await db.select({ scopeHash: authRateLimits.scopeHash }).from(authRateLimits)
    .where(lte(authRateLimits.expiresAt, input.rateLimitCutoff)).limit(limit);

  const codes = codeIds.length
    ? await db.delete(authEmailCodes).where(inArray(authEmailCodes.id, codeIds.map((row) => row.id))).returning({ id: authEmailCodes.id })
    : [];
  const sessions = sessionIds.length
    ? await db.delete(authSessions).where(inArray(authSessions.id, sessionIds.map((row) => row.id))).returning({ id: authSessions.id })
    : [];
  const rateLimits = rateLimitIds.length
    ? await db.delete(authRateLimits).where(inArray(authRateLimits.scopeHash, rateLimitIds.map((row) => row.scopeHash))).returning({ scopeHash: authRateLimits.scopeHash })
    : [];
  return { codes: codes.length, sessions: sessions.length, rateLimits: rateLimits.length };
}
