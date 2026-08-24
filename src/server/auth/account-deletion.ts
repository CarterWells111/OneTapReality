import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import type { BackendDatabase } from "../db/client";
import {
  accountDeletionChallenges,
  accountDeletionJobs,
  accountDeletionMediaObjects,
  authEmailCodes,
  authSessions,
  giftCardEvents,
  giftCards,
  giftEmailCodes,
  giftManagementRequests,
  giftMediaCleanupJobs,
  giftMembers,
  giftPublishSessions,
  giftSessions,
  gifts,
  sharedAlbumMedia,
  sharedAlbums,
  users,
} from "../db/schema";
import type { PrivateMediaStore } from "../gifts/r2-media";
import { sendAccountDeletionFailureEmailFromEnvironment } from "../gifts/resend-email-sender";
import { normalizeAccountEmail } from "./repository";

export type AcceptAccountDeletionResult =
  | { status: "accepted"; receiptId: string; completeBy: string }
  | { status: "invalid_challenge" | "challenge_used" | "challenge_expired" | "invalid_code" | "confirmation_required" };

type DeletionFailureNotice = { receiptId: string; errorCode: "account_media_delete_failed" | "account_cleanup_failed"; attempt: number };

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export async function createAccountDeletionChallenge(
  db: BackendDatabase,
  input: { id: string; userId: string; sessionId: string; codeHash: string; createdAt: string; expiresAt: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('account-deletion-challenge'), hashtext(${input.userId}))`);
    await tx.update(accountDeletionChallenges).set({ consumedAt: input.createdAt }).where(and(
      eq(accountDeletionChallenges.userId, input.userId),
      isNull(accountDeletionChallenges.consumedAt),
    ));
    await tx.insert(accountDeletionChallenges).values({ ...input, consumedAt: null, failedAttempts: 0 });
  });
}

export async function deleteAccountDeletionChallenge(db: BackendDatabase, id: string): Promise<void> {
  await db.delete(accountDeletionChallenges).where(eq(accountDeletionChallenges.id, id));
}

export async function isAccountDeletionChallengeRateLimited(
  db: BackendDatabase,
  userId: string,
  since: string,
): Promise<boolean> {
  const rows = await db.select({ id: accountDeletionChallenges.id }).from(accountDeletionChallenges).where(and(
    eq(accountDeletionChallenges.userId, userId),
    gt(accountDeletionChallenges.createdAt, since),
  )).limit(3);
  return rows.length >= 3;
}

function collectPublicationObjectKeys(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const value = payload as { media?: unknown; cover?: unknown };
  const media = Array.isArray(value.media)
    ? value.media.flatMap((item) => item && typeof item === "object" && typeof (item as { objectKey?: unknown }).objectKey === "string"
      ? [(item as { objectKey: string }).objectKey]
      : [])
    : [];
  const cover = value.cover && typeof value.cover === "object" && typeof (value.cover as { objectKey?: unknown }).objectKey === "string"
    ? [(value.cover as { objectKey: string }).objectKey]
    : [];
  return [...media, ...cover];
}

export async function acceptAccountDeletion(
  db: BackendDatabase,
  input: {
    challengeId: string;
    userId: string;
    sessionId: string;
    codeHash: string;
    confirmation: string;
    receiptId: string;
    now: string;
    completeBy: string;
  },
): Promise<AcceptAccountDeletionResult> {
  if (input.confirmation !== "DELETE") return { status: "confirmation_required" };

  return db.transaction(async (tx) => {
    const [challenge] = await tx.select().from(accountDeletionChallenges).where(and(
      eq(accountDeletionChallenges.id, input.challengeId),
      eq(accountDeletionChallenges.userId, input.userId),
      eq(accountDeletionChallenges.sessionId, input.sessionId),
    )).limit(1).for("update");
    if (!challenge) return { status: "invalid_challenge" as const };
    if (challenge.consumedAt) return { status: "challenge_used" as const };
    if (challenge.expiresAt <= input.now) return { status: "challenge_expired" as const };
    if (challenge.failedAttempts >= 5 || !constantTimeEqual(challenge.codeHash, input.codeHash)) {
      if (challenge.failedAttempts < 5) {
        await tx.update(accountDeletionChallenges).set({ failedAttempts: sql`${accountDeletionChallenges.failedAttempts} + 1` })
          .where(and(eq(accountDeletionChallenges.id, challenge.id), isNull(accountDeletionChallenges.consumedAt)));
      }
      return { status: "invalid_code" as const };
    }

    const [user] = await tx.select({ email: users.email, deletionState: users.deletionState }).from(users)
      .where(eq(users.id, input.userId)).limit(1).for("update");
    if (!user || user.deletionState !== "active") return { status: "invalid_challenge" as const };
    const email = normalizeAccountEmail(user.email);
    const owned = await tx.select({ giftId: giftMembers.giftId }).from(giftMembers).where(and(
      eq(giftMembers.email, email),
      eq(giftMembers.role, "owner"),
    ));
    const giftIds = [...new Set(owned.map((row) => row.giftId))];
    const objectKeys = new Set<string>();
    let nextAttemptAt = input.now;
    if (giftIds.length) {
      await tx.select({ id: gifts.id }).from(gifts)
        .where(inArray(gifts.id, giftIds))
        .orderBy(asc(gifts.id))
        .for("update");
      await tx.update(gifts).set({ status: "disabled", disabledAt: input.now }).where(inArray(gifts.id, giftIds));
      const media = await tx.select({ objectKey: sharedAlbumMedia.objectKey }).from(sharedAlbumMedia)
        .innerJoin(sharedAlbums, eq(sharedAlbumMedia.sharedAlbumId, sharedAlbums.id))
        .where(inArray(sharedAlbums.giftId, giftIds));
      media.forEach((row) => objectKeys.add(row.objectKey));
      const covers = await tx.select({ objectKey: sharedAlbums.coverObjectKey }).from(sharedAlbums)
        .where(inArray(sharedAlbums.giftId, giftIds));
      covers.forEach((row) => { if (row.objectKey) objectKeys.add(row.objectKey); });
      const publications = await tx.select({ payload: giftPublishSessions.payloadJson, expiresAt: giftPublishSessions.expiresAt }).from(giftPublishSessions)
        .where(and(inArray(giftPublishSessions.giftId, giftIds), isNull(giftPublishSessions.completedAt)));
      publications.flatMap((row) => collectPublicationObjectKeys(row.payload)).forEach((key) => objectKeys.add(key));
      const latestExpiry = publications.reduce((latest, row) => Math.max(latest, new Date(row.expiresAt).getTime()), 0);
      if (latestExpiry > 0) {
        const nowMs = new Date(input.now).getTime();
        const completeByMs = new Date(input.completeBy).getTime();
        nextAttemptAt = new Date(Math.max(nowMs, Math.min(completeByMs, latestExpiry + 60_000))).toISOString();
      }
      const existingCleanup = await tx.select({ objectKey: giftMediaCleanupJobs.objectKey }).from(giftMediaCleanupJobs)
        .where(inArray(giftMediaCleanupJobs.giftId, giftIds));
      existingCleanup.forEach((row) => objectKeys.add(row.objectKey));
    }

    await tx.insert(accountDeletionJobs).values({
      id: input.receiptId,
      userId: input.userId,
      accountEmail: email,
      state: "pending",
      attempts: 0,
      nextAttemptAt,
      leaseUntil: null,
      completeBy: input.completeBy,
      lastErrorCode: null,
      supportNotifiedAt: null,
      completedAt: null,
      createdAt: input.now,
    });
    if (objectKeys.size) {
      await tx.insert(accountDeletionMediaObjects).values([...objectKeys].sort().map((objectKey) => ({
        id: crypto.randomUUID(), jobId: input.receiptId, objectKey,
      })));
    }
    await tx.update(accountDeletionChallenges).set({ consumedAt: input.now }).where(and(
      eq(accountDeletionChallenges.id, challenge.id),
      isNull(accountDeletionChallenges.consumedAt),
    ));
    await tx.update(users).set({ deletionState: "pending", deletionRequestedAt: input.now }).where(and(
      eq(users.id, input.userId),
      eq(users.deletionState, "active"),
    ));
    await tx.update(authSessions).set({ revokedAt: input.now }).where(and(
      eq(authSessions.userId, input.userId),
      isNull(authSessions.revokedAt),
    ));
    await tx.update(giftSessions).set({ revokedAt: input.now }).where(and(
      eq(giftSessions.email, email),
      isNull(giftSessions.revokedAt),
    ));
    return { status: "accepted" as const, receiptId: input.receiptId, completeBy: input.completeBy };
  });
}

async function claimAccountDeletionJobs(
  db: BackendDatabase,
  now: string,
  leaseUntil: string,
  requestedLimit: number,
) {
  return db.transaction(async (tx) => {
    const limit = Math.max(1, Math.min(requestedLimit, 20));
    const selected = await tx.execute<{ id: string }>(sql`
      select id from account_deletion_jobs
      where (state = 'pending' and next_attempt_at <= ${now})
         or (state = 'processing' and lease_until <= ${now})
      order by next_attempt_at, id
      limit ${limit}
      for update skip locked
    `);
    const ids = selected.rows.map((row) => row.id);
    if (!ids.length) return [];
    return tx.update(accountDeletionJobs).set({
      state: "processing",
      leaseUntil,
      attempts: sql`${accountDeletionJobs.attempts} + 1`,
    }).where(inArray(accountDeletionJobs.id, ids)).returning();
  });
}

async function finalizeAccountDeletionJob(db: BackendDatabase, receiptId: string, completedAt: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [job] = await tx.select().from(accountDeletionJobs).where(and(
      eq(accountDeletionJobs.id, receiptId),
      eq(accountDeletionJobs.state, "processing"),
    )).limit(1).for("update");
    if (!job?.userId || !job.accountEmail) return false;
    const email = normalizeAccountEmail(job.accountEmail);
    const owned = await tx.select({ giftId: giftMembers.giftId }).from(giftMembers).where(and(
      eq(giftMembers.email, email),
      eq(giftMembers.role, "owner"),
    ));
    const giftIds = [...new Set(owned.map((row) => row.giftId))];

    if (giftIds.length) {
      await tx.delete(giftCards).where(inArray(giftCards.giftId, giftIds));
      await tx.delete(gifts).where(inArray(gifts.id, giftIds));
    }
    await tx.delete(giftManagementRequests).where(eq(giftManagementRequests.targetEmail, email));
    await tx.delete(giftPublishSessions).where(eq(giftPublishSessions.ownerEmail, email));
    await tx.delete(giftMembers).where(eq(giftMembers.email, email));
    await tx.delete(giftEmailCodes).where(eq(giftEmailCodes.email, email));
    await tx.delete(giftSessions).where(eq(giftSessions.email, email));
    await tx.delete(authEmailCodes).where(eq(authEmailCodes.email, email));
    await tx.update(giftCards).set({ createdByEmail: "deleted-account" }).where(eq(giftCards.createdByEmail, email));
    await tx.update(giftCardEvents).set({ actorEmail: "deleted-account" }).where(eq(giftCardEvents.actorEmail, email));
    await tx.delete(accountDeletionMediaObjects).where(eq(accountDeletionMediaObjects.jobId, receiptId));
    const completed = await tx.update(accountDeletionJobs).set({
      userId: null,
      accountEmail: null,
      state: "completed",
      leaseUntil: null,
      nextAttemptAt: completedAt,
      lastErrorCode: null,
      completedAt,
    }).where(and(eq(accountDeletionJobs.id, receiptId), eq(accountDeletionJobs.state, "processing")))
      .returning({ id: accountDeletionJobs.id });
    if (completed.length !== 1) return false;
    await tx.delete(users).where(eq(users.id, job.userId));
    return true;
  });
}

async function failAccountDeletionJob(
  db: BackendDatabase,
  input: { receiptId: string; errorCode: DeletionFailureNotice["errorCode"]; nextAttemptAt: string },
): Promise<void> {
  await db.update(accountDeletionJobs).set({
    state: "pending",
    leaseUntil: null,
    nextAttemptAt: input.nextAttemptAt,
    lastErrorCode: input.errorCode,
  }).where(and(eq(accountDeletionJobs.id, input.receiptId), eq(accountDeletionJobs.state, "processing")));
}

async function deleteObjectsWithAbort(store: PrivateMediaStore, objectKeys: string[]): Promise<void> {
  if (!objectKeys.length) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  (timeout as unknown as { unref?: () => void }).unref?.();
  try {
    await store.deleteObjects(objectKeys, { abortSignal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function processAccountDeletionJobs(input: {
  db: BackendDatabase;
  store: PrivateMediaStore;
  now?: Date;
  limit?: number;
  notifyFailure?: (notice: DeletionFailureNotice) => Promise<void>;
}): Promise<{ claimed: number; completed: number; failed: number }> {
  const now = input.now ?? new Date();
  const nowText = now.toISOString();
  const leaseUntil = new Date(now.getTime() + 5 * 60_000).toISOString();
  const jobs = await claimAccountDeletionJobs(input.db, nowText, leaseUntil, input.limit ?? 10);
  const stats = { claimed: jobs.length, completed: 0, failed: 0 };
  const notifyFailure = input.notifyFailure ?? sendAccountDeletionFailureEmailFromEnvironment;

  for (const job of jobs) {
    let errorCode: DeletionFailureNotice["errorCode"] = "account_media_delete_failed";
    try {
      const objects = await input.db.select({ objectKey: accountDeletionMediaObjects.objectKey })
        .from(accountDeletionMediaObjects)
        .where(eq(accountDeletionMediaObjects.jobId, job.id))
        .orderBy(asc(accountDeletionMediaObjects.objectKey));
      await deleteObjectsWithAbort(input.store, objects.map((row) => row.objectKey));
      errorCode = "account_cleanup_failed";
      if (!await finalizeAccountDeletionJob(input.db, job.id, nowText)) throw new Error("Account deletion job changed state");
      stats.completed += 1;
    } catch {
      const delayMinutes = Math.min(6 * 60, 5 * 2 ** Math.max(0, job.attempts - 1));
      await failAccountDeletionJob(input.db, {
        receiptId: job.id,
        errorCode,
        nextAttemptAt: new Date(now.getTime() + delayMinutes * 60_000).toISOString(),
      });
      try {
        await notifyFailure({ receiptId: job.id, errorCode, attempt: job.attempts });
        await input.db.update(accountDeletionJobs).set({ supportNotifiedAt: nowText }).where(eq(accountDeletionJobs.id, job.id));
      } catch {
        // The deletion job remains pending; a later attempt retries both cleanup and notification.
      }
      stats.failed += 1;
    }
  }
  return stats;
}
