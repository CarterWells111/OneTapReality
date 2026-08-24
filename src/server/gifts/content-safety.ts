import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import type { BackendDatabase } from "../db/client";
import type { GiftContentReportReason } from "../db/schema";
import {
  giftContentReports,
  giftMemberActivations,
  giftMembers,
  gifts,
  sharedAlbums,
  userBlocks,
  users,
} from "../db/schema";

export const GIFT_CONTENT_REPORT_REASONS = [
  "sexual",
  "harassment",
  "hate",
  "violence",
  "spam",
  "other",
] as const satisfies readonly GiftContentReportReason[];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeBlockedEmailPair(firstEmail: string, secondEmail: string): [string, string] {
  const pair = [normalizeEmail(firstEmail), normalizeEmail(secondEmail)].sort();
  return [pair[0], pair[1]];
}

export function blockedEmailPairCondition(firstEmail: string, secondEmail: string) {
  const [emailLow, emailHigh] = normalizeBlockedEmailPair(firstEmail, secondEmail);
  return and(eq(userBlocks.emailLow, emailLow), eq(userBlocks.emailHigh, emailHigh));
}

type GiftContentReportDto = {
  id: string;
  giftId: string;
  reason: GiftContentReportReason;
  snapshotVersion: number;
  supportNotifiedAt: string | null;
  createdAt: string;
};

export async function reportGiftContent(
  db: BackendDatabase,
  input: {
    giftId: string;
    reporterUserId: string;
    reporterEmail: string;
    reason: GiftContentReportReason;
    details?: string;
    now: string;
  },
): Promise<
  | { status: "created"; report: GiftContentReportDto }
  | { status: "existing"; report: GiftContentReportDto }
  | { status: "forbidden" }
  | { status: "no_snapshot" }
> {
  const reporterEmail = normalizeEmail(input.reporterEmail);
  return db.transaction(async (tx) => {
    const lockedGift = await tx.update(gifts)
      .set({ createdAt: sql`${gifts.createdAt}` })
      .where(and(eq(gifts.id, input.giftId), eq(gifts.status, "bound")))
      .returning({ id: gifts.id });
    if (!lockedGift.length) return { status: "forbidden" as const };

    const [relationship] = await tx.select({ memberId: giftMembers.id })
      .from(giftMembers)
      .leftJoin(giftMemberActivations, eq(giftMemberActivations.memberId, giftMembers.id))
      .where(and(
        eq(giftMembers.giftId, input.giftId),
        eq(giftMembers.email, reporterEmail),
        or(eq(giftMembers.role, "owner"), eq(giftMemberActivations.userId, input.reporterUserId)),
      ))
      .limit(1);
    if (!relationship) return { status: "forbidden" as const };

    const [snapshot] = await tx.select({ version: sharedAlbums.version })
      .from(sharedAlbums)
      .where(eq(sharedAlbums.giftId, input.giftId))
      .limit(1);
    if (!snapshot) return { status: "no_snapshot" as const };

    const [existing] = await tx.select().from(giftContentReports).where(and(
      eq(giftContentReports.giftId, input.giftId),
      eq(giftContentReports.reporterUserId, input.reporterUserId),
      eq(giftContentReports.snapshotVersion, snapshot.version),
    )).limit(1);
    if (existing) return { status: "existing" as const, report: existing };

    const [created] = await tx.insert(giftContentReports).values({
      id: crypto.randomUUID(),
      giftId: input.giftId,
      reporterUserId: input.reporterUserId,
      reason: input.reason,
      details: input.details?.trim() || null,
      snapshotVersion: snapshot.version,
      state: "open",
      disposition: null,
      dispositionNote: null,
      disposedAt: null,
      supportNotifiedAt: null,
      createdAt: input.now,
    }).onConflictDoNothing().returning();
    if (created) return { status: "created" as const, report: created };

    const [concurrent] = await tx.select().from(giftContentReports).where(and(
      eq(giftContentReports.giftId, input.giftId),
      eq(giftContentReports.reporterUserId, input.reporterUserId),
      eq(giftContentReports.snapshotVersion, snapshot.version),
    )).limit(1);
    if (!concurrent) throw new Error("Gift report conflict could not be resolved");
    return { status: "existing" as const, report: concurrent };
  });
}

export async function markGiftContentReportSupportNotified(
  db: BackendDatabase,
  reportId: string,
  notifiedAt: string,
): Promise<void> {
  await db.update(giftContentReports)
    .set({ supportNotifiedAt: notifiedAt })
    .where(and(eq(giftContentReports.id, reportId), eq(giftContentReports.state, "open")));
}

export type GiftContentReportSupportNotice = {
  reportId: string;
  giftId: string;
  snapshotVersion: number;
  reason: GiftContentReportReason;
};

export async function processPendingGiftContentReportNotifications(
  db: BackendDatabase,
  input: {
    now: string;
    limit?: number;
    sendNotice: (notice: GiftContentReportSupportNotice) => Promise<void>;
  },
): Promise<{ attempted: number; notified: number; failed: number }> {
  const limit = Math.max(1, Math.min(100, Math.floor(input.limit ?? 10)));
  const pending = await db.select({
    reportId: giftContentReports.id,
    giftId: giftContentReports.giftId,
    snapshotVersion: giftContentReports.snapshotVersion,
    reason: giftContentReports.reason,
  }).from(giftContentReports).where(and(
    eq(giftContentReports.state, "open"),
    isNull(giftContentReports.supportNotifiedAt),
  )).orderBy(asc(giftContentReports.createdAt), asc(giftContentReports.id)).limit(limit);

  let notified = 0;
  let failed = 0;
  for (const notice of pending) {
    try {
      await input.sendNotice(notice);
      await markGiftContentReportSupportNotified(db, notice.reportId, input.now);
      notified += 1;
    } catch {
      // The null support_notified_at value is the durable retry marker; never persist provider errors.
      failed += 1;
    }
  }
  return { attempted: pending.length, notified, failed };
}

export async function recordGiftContentReportDisposition(
  db: BackendDatabase,
  input: {
    reportId: string;
    state: "resolved" | "dismissed";
    disposition: "content_disabled" | "member_removed" | "no_violation";
    note?: string;
    disposedAt: string;
  },
): Promise<boolean> {
  const note = input.note?.trim() || null;
  if (note && note.length > 500) return false;
  const updated = await db.update(giftContentReports).set({
    state: input.state,
    disposition: input.disposition,
    dispositionNote: note,
    disposedAt: input.disposedAt,
  }).where(and(eq(giftContentReports.id, input.reportId), eq(giftContentReports.state, "open")))
    .returning({ id: giftContentReports.id });
  return updated.length === 1;
}

type GiftBlockDto = { id: string; createdAt: string };

export async function blockGiftUser(
  db: BackendDatabase,
  input: {
    giftId: string;
    actorUserId: string;
    actorEmail: string;
    targetUserId?: string;
    targetEmail?: string;
    now: string;
  },
): Promise<
  | { status: "created"; block: GiftBlockDto }
  | { status: "existing"; block: GiftBlockDto }
  | { status: "forbidden" }
  | { status: "invalid_target" }
> {
  const actorEmail = normalizeEmail(input.actorEmail);
  return db.transaction(async (tx) => {
    const lockedGift = await tx.update(gifts)
      .set({ createdAt: sql`${gifts.createdAt}` })
      .where(and(eq(gifts.id, input.giftId), eq(gifts.status, "bound")))
      .returning({ id: gifts.id });
    if (!lockedGift.length) return { status: "forbidden" as const };

    let targetEmail = input.targetEmail ? normalizeEmail(input.targetEmail) : null;
    let targetUserId = input.targetUserId;
    if (targetUserId) {
      const [targetUser] = await tx.select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);
      if (!targetUser || (targetEmail && targetEmail !== targetUser.email)) return { status: "invalid_target" as const };
      targetEmail = targetUser.email;
    }
    if (!targetEmail) {
      const [owner] = await tx.select({ email: giftMembers.email })
        .from(giftMembers)
        .where(and(eq(giftMembers.giftId, input.giftId), eq(giftMembers.role, "owner")))
        .limit(1);
      if (!owner) return { status: "invalid_target" as const };
      targetEmail = owner.email;
    }
    if (targetEmail === actorEmail) return { status: "invalid_target" as const };

    const [emailLow, emailHigh] = normalizeBlockedEmailPair(actorEmail, targetEmail);
    const [existing] = await tx.select({ id: userBlocks.id, createdAt: userBlocks.createdAt })
      .from(userBlocks)
      .where(and(
        eq(userBlocks.emailLow, emailLow),
        eq(userBlocks.emailHigh, emailHigh),
        eq(userBlocks.sourceGiftId, input.giftId),
      ))
      .limit(1);
    if (existing) return { status: "existing" as const, block: existing };

    const [actorRelationship] = await tx.select({ memberId: giftMembers.id })
      .from(giftMembers)
      .leftJoin(giftMemberActivations, eq(giftMemberActivations.memberId, giftMembers.id))
      .where(and(
        eq(giftMembers.giftId, input.giftId),
        eq(giftMembers.email, actorEmail),
        or(eq(giftMembers.role, "owner"), eq(giftMemberActivations.userId, input.actorUserId)),
      ))
      .limit(1);
    if (!actorRelationship) return { status: "forbidden" as const };

    const [targetRelationship] = await tx.select({ memberId: giftMembers.id })
      .from(giftMembers)
      .where(and(eq(giftMembers.giftId, input.giftId), eq(giftMembers.email, targetEmail)))
      .limit(1);
    if (!targetRelationship) return { status: "invalid_target" as const };

    if (!targetUserId) {
      const [targetUser] = await tx.select({ id: users.id }).from(users).where(eq(users.email, targetEmail)).limit(1);
      targetUserId = targetUser?.id;
    }

    const [created] = await tx.insert(userBlocks).values({
      id: crypto.randomUUID(),
      blockerUserId: input.actorUserId,
      blockerEmail: actorEmail,
      blockedUserId: targetUserId ?? null,
      blockedEmail: targetEmail,
      emailLow,
      emailHigh,
      sourceGiftId: input.giftId,
      createdAt: input.now,
    }).onConflictDoNothing().returning({ id: userBlocks.id, createdAt: userBlocks.createdAt });

    await tx.delete(giftMembers).where(and(
      eq(giftMembers.giftId, input.giftId),
      inArray(giftMembers.email, [actorEmail, targetEmail]),
      or(eq(giftMembers.role, "viewer"), eq(giftMembers.role, "editor")),
    ));

    if (created) return { status: "created" as const, block: created };
    const [concurrent] = await tx.select({ id: userBlocks.id, createdAt: userBlocks.createdAt })
      .from(userBlocks)
      .where(and(eq(userBlocks.emailLow, emailLow), eq(userBlocks.emailHigh, emailHigh)))
      .limit(1);
    if (!concurrent) throw new Error("Gift block conflict could not be resolved");
    return { status: "existing" as const, block: concurrent };
  });
}

export async function leaveGiftMembership(
  db: BackendDatabase,
  input: { giftId: string; userId: string; email: string },
): Promise<{ status: "left" | "forbidden" | "owner_forbidden" }> {
  const email = normalizeEmail(input.email);
  return db.transaction(async (tx) => {
    const lockedGift = await tx.update(gifts)
      .set({ createdAt: sql`${gifts.createdAt}` })
      .where(and(eq(gifts.id, input.giftId), eq(gifts.status, "bound")))
      .returning({ id: gifts.id });
    if (!lockedGift.length) return { status: "forbidden" as const };

    const [relationship] = await tx.select({ memberId: giftMembers.id, role: giftMembers.role })
      .from(giftMembers)
      .leftJoin(giftMemberActivations, eq(giftMemberActivations.memberId, giftMembers.id))
      .where(and(
        eq(giftMembers.giftId, input.giftId),
        eq(giftMembers.email, email),
        or(eq(giftMembers.role, "owner"), eq(giftMemberActivations.userId, input.userId)),
      ))
      .limit(1);
    if (!relationship) return { status: "forbidden" as const };
    if (relationship.role === "owner") return { status: "owner_forbidden" as const };

    const removed = await tx.delete(giftMembers)
      .where(and(eq(giftMembers.giftId, input.giftId), eq(giftMembers.id, relationship.memberId)))
      .returning({ id: giftMembers.id });
    return { status: removed.length === 1 ? "left" as const : "forbidden" as const };
  });
}
