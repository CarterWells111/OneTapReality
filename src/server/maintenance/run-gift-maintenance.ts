import { and, eq, isNull, lte, or } from "drizzle-orm";

import { purgeAuthTechnicalData } from "../auth/repository";
import { processAccountDeletionJobs } from "../auth/account-deletion";
import type { BackendDatabase } from "../db/client";
import { appMaintenanceState } from "../db/schema";
import {
  claimGiftMediaCleanupJobs,
  completeGiftMediaCleanupJob,
  expireGiftCardReservations,
  expireGiftPublishSessions,
  failGiftMediaCleanupJob,
  isGiftMediaObjectReferenced,
  purgeGiftMaintenanceData,
} from "../gifts/repository";
import { processPendingGiftContentReportNotifications, type GiftContentReportSupportNotice } from "../gifts/content-safety";
import type { PrivateMediaStore } from "../gifts/r2-media";
import { sendGiftContentReportSupportEmailFromEnvironment } from "../gifts/resend-email-sender";

export type GiftMaintenanceMode = "scheduled" | "opportunistic";

export type GiftMaintenanceStats = {
  skipped: boolean;
  expiredCards: number;
  expiredPublications: number;
  claimedCleanupJobs: number;
  completedCleanupJobs: number;
  failedCleanupJobs: number;
  deadLetteredCleanupJobs: number;
  purgedAuthCodes: number;
  purgedAuthSessions: number;
  purgedRateLimits: number;
  purgedPublishSessions: number;
  purgedCleanupJobs: number;
  claimedAccountDeletionJobs: number;
  completedAccountDeletionJobs: number;
  failedAccountDeletionJobs: number;
  attemptedContentReportNotices: number;
  notifiedContentReports: number;
  failedContentReportNotices: number;
};

const emptyStats = (): GiftMaintenanceStats => ({
  skipped: false,
  expiredCards: 0,
  expiredPublications: 0,
  claimedCleanupJobs: 0,
  completedCleanupJobs: 0,
  failedCleanupJobs: 0,
  deadLetteredCleanupJobs: 0,
  purgedAuthCodes: 0,
  purgedAuthSessions: 0,
  purgedRateLimits: 0,
  purgedPublishSessions: 0,
  purgedCleanupJobs: 0,
  claimedAccountDeletionJobs: 0,
  completedAccountDeletionJobs: 0,
  failedAccountDeletionJobs: 0,
  attemptedContentReportNotices: 0,
  notifiedContentReports: 0,
  failedContentReportNotices: 0,
});

async function acquireMaintenanceLease(db: BackendDatabase, now: string, leaseUntil: string, leaseToken: string): Promise<boolean> {
  await db.insert(appMaintenanceState).values({
    id: "gift",
    leaseToken: null,
    leaseUntil: null,
    lastStartedAt: null,
    lastCompletedAt: null,
    lastErrorCode: null,
  }).onConflictDoNothing({ target: appMaintenanceState.id });
  const acquired = await db.update(appMaintenanceState).set({ leaseToken, leaseUntil, lastStartedAt: now, lastErrorCode: null })
    .where(and(eq(appMaintenanceState.id, "gift"), or(isNull(appMaintenanceState.leaseUntil), lte(appMaintenanceState.leaseUntil, now))))
    .returning({ id: appMaintenanceState.id });
  return acquired.length === 1;
}

async function completeMaintenanceLease(db: BackendDatabase, leaseToken: string, completedAt: string): Promise<void> {
  await db.update(appMaintenanceState).set({ leaseToken: null, leaseUntil: null, lastCompletedAt: completedAt, lastErrorCode: null })
    .where(and(eq(appMaintenanceState.id, "gift"), eq(appMaintenanceState.leaseToken, leaseToken)));
}

async function failMaintenanceLease(db: BackendDatabase, leaseToken: string): Promise<void> {
  await db.update(appMaintenanceState).set({ leaseToken: null, leaseUntil: null, lastErrorCode: "maintenance_failed" })
    .where(and(eq(appMaintenanceState.id, "gift"), eq(appMaintenanceState.leaseToken, leaseToken)));
}

export async function isGiftMaintenanceOverdue(db: BackendDatabase, overdueBefore: string): Promise<boolean> {
  const [state] = await db.select({ lastCompletedAt: appMaintenanceState.lastCompletedAt }).from(appMaintenanceState)
    .where(eq(appMaintenanceState.id, "gift")).limit(1);
  return !state?.lastCompletedAt || state.lastCompletedAt <= overdueBefore;
}

function subtract(now: Date, milliseconds: number): string {
  return new Date(now.getTime() - milliseconds).toISOString();
}

async function deleteObjectsWithinBudget(
  store: PrivateMediaStore,
  objectKeys: string[],
  remainingMs: number,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, remainingMs));
  (timeout as unknown as { unref?: () => void }).unref?.();
  const aborted = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener("abort", () => reject(new Error("Maintenance time budget exceeded")), { once: true });
  });
  try {
    await Promise.race([
      store.deleteObjects(objectKeys, { abortSignal: controller.signal }),
      aborted,
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export async function runGiftMaintenance(input: {
  db: BackendDatabase;
  store: PrivateMediaStore;
  mode: GiftMaintenanceMode;
  now?: Date;
  sendContentReportNotice?: (notice: GiftContentReportSupportNotice) => Promise<void>;
}): Promise<GiftMaintenanceStats> {
  const now = input.now ?? new Date();
  const nowText = now.toISOString();
  const batchSize = input.mode === "scheduled" ? 50 : 5;
  const purgeSize = input.mode === "scheduled" ? 100 : 20;
  const concurrency = input.mode === "scheduled" ? 5 : 1;
  const timeBudgetMs = input.mode === "scheduled" ? 20_000 : 2_000;
  const startedAt = Date.now();
  const leaseToken = crypto.randomUUID();
  const leaseUntil = new Date(now.getTime() + 5 * 60_000).toISOString();
  const stats = emptyStats();
  const hasTimeRemaining = () => Date.now() - startedAt < timeBudgetMs;

  if (!await acquireMaintenanceLease(input.db, nowText, leaseUntil, leaseToken)) return { ...stats, skipped: true };

  try {
    const deletion = await processAccountDeletionJobs({
      db: input.db,
      store: input.store,
      now,
      limit: input.mode === "scheduled" ? 10 : 1,
    });
    stats.claimedAccountDeletionJobs = deletion.claimed;
    stats.completedAccountDeletionJobs = deletion.completed;
    stats.failedAccountDeletionJobs = deletion.failed;

    if (hasTimeRemaining()) stats.expiredCards = await expireGiftCardReservations(input.db, nowText, batchSize);
    if (hasTimeRemaining()) stats.expiredPublications = await expireGiftPublishSessions(input.db, nowText, batchSize);
    const jobs = hasTimeRemaining()
      ? await claimGiftMediaCleanupJobs(input.db, nowText, leaseUntil, batchSize)
      : [];
    stats.claimedCleanupJobs = jobs.length;

    for (let offset = 0; offset < jobs.length && Date.now() - startedAt < timeBudgetMs; offset += concurrency) {
      const chunk = jobs.slice(offset, offset + concurrency);
      await Promise.all(chunk.map(async (job) => {
        try {
          if (!await isGiftMediaObjectReferenced(input.db, job.objectKey)) {
            await deleteObjectsWithinBudget(input.store, [job.objectKey], timeBudgetMs - (Date.now() - startedAt));
          }
          await completeGiftMediaCleanupJob(input.db, job.id, nowText);
          stats.completedCleanupJobs += 1;
        } catch {
          const delayMinutes = Math.min(6 * 60, 5 * 2 ** Math.max(0, job.attempts - 1));
          const nextAttemptAt = new Date(now.getTime() + delayMinutes * 60_000).toISOString();
          const state = await failGiftMediaCleanupJob(input.db, job.id, "r2_delete_failed", nowText, nextAttemptAt);
          if (state === "dead_letter") stats.deadLetteredCleanupJobs += 1;
          else stats.failedCleanupJobs += 1;
        }
      }));
    }

    if (hasTimeRemaining()) {
      const reports = await processPendingGiftContentReportNotifications(input.db, {
        now: nowText,
        limit: input.mode === "scheduled" ? 10 : 1,
        sendNotice: input.sendContentReportNotice ?? sendGiftContentReportSupportEmailFromEnvironment,
      });
      stats.attemptedContentReportNotices = reports.attempted;
      stats.notifiedContentReports = reports.notified;
      stats.failedContentReportNotices = reports.failed;
    }
    const auth = hasTimeRemaining()
      ? await purgeAuthTechnicalData(input.db, {
        codeCutoff: subtract(now, 6 * 60 * 60_000),
        sessionCutoff: subtract(now, 7 * 24 * 60 * 60_000),
        rateLimitCutoff: subtract(now, 6 * 60 * 60_000),
        limit: purgeSize,
      })
      : { codes: 0, sessions: 0, rateLimits: 0 };
    const gifts = hasTimeRemaining()
      ? await purgeGiftMaintenanceData(input.db, {
        publishCutoff: subtract(now, 24 * 60 * 60_000),
        jobCutoff: subtract(now, 7 * 24 * 60 * 60_000),
        limit: purgeSize,
      })
      : { publishSessions: 0, cleanupJobs: 0 };
    stats.purgedAuthCodes = auth.codes;
    stats.purgedAuthSessions = auth.sessions;
    stats.purgedRateLimits = auth.rateLimits;
    stats.purgedPublishSessions = gifts.publishSessions;
    stats.purgedCleanupJobs = gifts.cleanupJobs;
    await completeMaintenanceLease(input.db, leaseToken, nowText);
    return stats;
  } catch (error) {
    await failMaintenanceLease(input.db, leaseToken);
    throw error;
  }
}
