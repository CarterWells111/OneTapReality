import { and, eq, gt, ilike, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import type { BackendDatabase } from "../db/client";
import type { GiftMemberRole } from "../db/schema";
import { giftCardEvents, giftCards, giftContentReports, giftManagementRequests, giftMediaCleanupJobs, giftMemberActivations, giftMembers, giftPublishSessions, gifts, sharedAlbumMedia, sharedAlbumPages, sharedAlbums, userBlocks, users } from "../db/schema";
import { blockedEmailPairCondition, recordGiftRelationshipTombstone } from "./content-safety";

export type GiftPublicationPayload = {
  sourceMemoryId: string;
  title: string;
  /** Optional solely for upgraded publish sessions whose stored JSON predates travelDate. */
  travelDate?: string | null;
  pages: { position: number; page: unknown }[];
  media: { position: number; objectKey: string; contentType: string; byteSize: number; source?: "existing" | "upload" }[];
  /** 独立封面对象；旧客户端载荷可能缺失该字段，按 null 处理。 */
  cover?: { objectKey: string; contentType: string; byteSize: number } | null;
};

export class GiftAlbumVersionConflictError extends Error {
  readonly code = "gift_album_version_conflict";
  constructor() { super("The shared album changed after this edit began"); }
}

export class GiftPublicationUnavailableError extends Error {
  readonly code = "gift_publication_unavailable";
  constructor() { super("This gift is no longer available for publishing"); }
}

export class GiftRelationshipBlockedError extends Error {
  readonly code = "gift_relationship_blocked";
  constructor() { super("These accounts cannot share gifts"); }
}

export async function resolveExistingGiftMedia(db: BackendDatabase, giftId: string, baseVersion: number, refs: { position: number; mediaId: string }[]) {
  if (!refs.length) return [];
  const [album] = await db.select({ id: sharedAlbums.id, version: sharedAlbums.version }).from(sharedAlbums).where(eq(sharedAlbums.giftId, giftId)).limit(1);
  if (!album || album.version !== baseVersion) throw new GiftAlbumVersionConflictError();
  const rows = await db.select({ id: sharedAlbumMedia.id, objectKey: sharedAlbumMedia.objectKey, contentType: sharedAlbumMedia.contentType, byteSize: sharedAlbumMedia.byteSize })
    .from(sharedAlbumMedia).where(and(eq(sharedAlbumMedia.sharedAlbumId, album.id), inArray(sharedAlbumMedia.id, refs.map(ref => ref.mediaId))));
  if (rows.length !== new Set(refs.map(ref => ref.mediaId)).size) return null;
  const byId = new Map(rows.map(row => [row.id, row]));
  return refs.map(ref => ({ position: ref.position, objectKey: byId.get(ref.mediaId)!.objectKey, contentType: byId.get(ref.mediaId)!.contentType, byteSize: byId.get(ref.mediaId)!.byteSize, source: "existing" as const }));
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

const publicationTails = new Map<string, Promise<void>>();

async function withPublicationLock<T>(giftId: string, work: () => Promise<T>): Promise<T> {
  const previous = publicationTails.get(giftId) ?? Promise.resolve();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => gate);
  publicationTails.set(giftId, tail);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (publicationTails.get(giftId) === tail) publicationTails.delete(giftId);
  }
}

export async function createGift(
  db: BackendDatabase,
  input: { id: string; tokenHash: string; createdAt: string },
) {
  await db.insert(gifts).values({ ...input, status: "unclaimed", claimedAt: null, disabledAt: null });
}

export async function getGiftStatusByTokenHash(db: BackendDatabase, tokenHash: string) {
  const [gift] = await db.select({ status: gifts.status }).from(gifts).where(eq(gifts.tokenHash, tokenHash)).limit(1);
  return gift?.status ?? null;
}

export async function claimGiftByTokenHash(
  db: BackendDatabase,
  tokenHash: string,
  email: string,
  claimedAt: string,
): Promise<{ id: string; status: "bound"; ownerEmail: string } | null> {
  const ownerEmail = normalizeEmail(email);
  return db.transaction(async (tx) => {
    const priorMembers = await tx.select({ email: giftMembers.email })
      .from(gifts)
      .innerJoin(giftMembers, eq(giftMembers.giftId, gifts.id))
      .where(eq(gifts.tokenHash, tokenHash));
    for (const member of priorMembers) {
      const [blocked] = await tx.select({ id: userBlocks.id })
        .from(userBlocks)
        .where(blockedEmailPairCondition(ownerEmail, member.email))
        .limit(1);
      if (blocked) throw new GiftRelationshipBlockedError();
    }
    // This conditional update is the ownership lock: only one concurrent claimant can win.
    const updated = await tx.update(gifts)
      .set({ status: "bound", claimedAt })
      .where(and(eq(gifts.tokenHash, tokenHash), eq(gifts.status, "unclaimed")))
      .returning({ id: gifts.id });
    if (updated.length !== 1) return null;
    await tx.insert(giftMembers).values({
      id: crypto.randomUUID(),
      giftId: updated[0].id,
      email: ownerEmail,
      role: "owner",
      createdAt: claimedAt,
    });
    return { id: updated[0].id, status: "bound" as const, ownerEmail };
  });
}

export async function listOwnedGifts(db: BackendDatabase, email: string) {
  const ownerEmail = normalizeEmail(email);
  const rows = await db.select({
    id: gifts.id,
    status: gifts.status,
    claimedAt: gifts.claimedAt,
    albumId: sharedAlbums.id,
    albumTitle: sharedAlbums.title,
    travelDate: sharedAlbums.travelDate,
    publishedAt: sharedAlbums.publishedAt,
    version: sharedAlbums.version,
    coverObjectKey: sharedAlbums.coverObjectKey,
    coverContentType: sharedAlbums.coverContentType,
    coverByteSize: sharedAlbums.coverByteSize,
  })
    .from(gifts)
    .innerJoin(giftMembers, eq(giftMembers.giftId, gifts.id))
    .leftJoin(sharedAlbums, eq(sharedAlbums.giftId, gifts.id))
    .where(and(eq(giftMembers.email, ownerEmail), eq(giftMembers.role, "owner")));
  return rows;
}

/** Gifts shared with the current account, restricted to live viewer memberships. */
export async function listInvitedGifts(db: BackendDatabase, userId: string, email: string) {
  const viewerEmail = normalizeEmail(email);
  return db.select({
    giftId: gifts.id,
    role: giftMembers.role,
    albumId: sharedAlbums.id,
    albumTitle: sharedAlbums.title,
    travelDate: sharedAlbums.travelDate,
    publishedAt: sharedAlbums.publishedAt,
    version: sharedAlbums.version,
    coverObjectKey: sharedAlbums.coverObjectKey,
    coverContentType: sharedAlbums.coverContentType,
    coverByteSize: sharedAlbums.coverByteSize,
  })
    .from(gifts)
    .innerJoin(giftMembers, eq(giftMembers.giftId, gifts.id))
    .innerJoin(giftMemberActivations, eq(giftMemberActivations.memberId, giftMembers.id))
    .leftJoin(giftContentReports, and(eq(giftContentReports.giftId, gifts.id), eq(giftContentReports.reporterUserId, userId)))
    .leftJoin(sharedAlbums, eq(sharedAlbums.giftId, gifts.id))
    .where(and(eq(giftMembers.email, viewerEmail), or(eq(giftMembers.role, "viewer"), eq(giftMembers.role, "editor")), eq(giftMemberActivations.userId, userId), eq(gifts.status, "bound"), isNull(giftContentReports.id)));
}

export async function activateGiftViewerByTokenHash(
  db: BackendDatabase,
  tokenHash: string,
  account: { id: string; email: string },
  activatedAt: string,
): Promise<{ giftId: string; role: "viewer" | "editor"; albumPublished: boolean } | null> {
  return db.transaction(async (tx) => {
    const lockedGift = await tx.update(gifts).set({ createdAt: sql`${gifts.createdAt}` })
      .where(and(eq(gifts.tokenHash, tokenHash), eq(gifts.status, "bound")))
      .returning({ id: gifts.id });
    if (!lockedGift.length) return null;
    const [eligible] = await tx.select({ memberId: giftMembers.id, giftId: gifts.id, role: giftMembers.role, albumId: sharedAlbums.id })
      .from(gifts)
      .innerJoin(giftMembers, eq(giftMembers.giftId, gifts.id))
      .leftJoin(sharedAlbums, eq(sharedAlbums.giftId, gifts.id))
      .where(and(eq(gifts.id, lockedGift[0].id), eq(giftMembers.email, normalizeEmail(account.email)), or(eq(giftMembers.role, "viewer"), eq(giftMembers.role, "editor"))))
      .limit(1);
    if (!eligible) return null;
    const [reported] = await tx.select({ id: giftContentReports.id }).from(giftContentReports)
      .where(and(eq(giftContentReports.giftId, eligible.giftId), eq(giftContentReports.reporterUserId, account.id)))
      .limit(1);
    if (reported) return null;
    const [ownerMember] = await tx.select({ email: giftMembers.email }).from(giftMembers)
      .where(and(eq(giftMembers.giftId, eligible.giftId), eq(giftMembers.role, "owner")))
      .limit(1);
    if (!ownerMember) return null;
    const [blocked] = await tx.select({ id: userBlocks.id })
      .from(userBlocks)
      .where(blockedEmailPairCondition(account.email, ownerMember.email))
      .limit(1);
    if (blocked) throw new GiftRelationshipBlockedError();
    await tx.insert(giftMemberActivations)
      .values({ memberId: eligible.memberId, userId: account.id, activatedAt })
      .onConflictDoUpdate({ target: giftMemberActivations.memberId, set: { userId: account.id, activatedAt } });
    return { giftId: eligible.giftId, role: eligible.role as "viewer" | "editor", albumPublished: eligible.albumId !== null };
  });
}

/** Uses a non-secret internal id for owner-only management screens. */
export async function getOwnedGiftById(db: BackendDatabase, giftId: string, email: string) {
  const [gift] = await db.select({ id: gifts.id, status: gifts.status, claimedAt: gifts.claimedAt, disabledAt: gifts.disabledAt })
    .from(gifts)
    .innerJoin(giftMembers, eq(giftMembers.giftId, gifts.id))
    .where(and(eq(gifts.id, giftId), eq(giftMembers.email, normalizeEmail(email)), eq(giftMembers.role, "owner")))
    .limit(1);
  return gift ?? null;
}

export async function addGiftMember(db: BackendDatabase, giftId: string, email: string, createdAt: string, role: Exclude<GiftMemberRole, "owner"> = "viewer"): Promise<boolean> {
  if (role !== "viewer" && role !== "editor") return false;
  const normalized = normalizeEmail(email);
  return db.transaction(async (tx) => {
    // A no-op row update takes a per-gift PostgreSQL row lock before counting members.
    const locked = await tx.update(gifts).set({ createdAt: sql`${gifts.createdAt}` })
      .where(and(eq(gifts.id, giftId), eq(gifts.status, "bound")))
      .returning({ id: gifts.id });
    if (!locked.length) return false;
    const members = await tx.select({ email: giftMembers.email }).from(giftMembers).where(eq(giftMembers.giftId, giftId));
    if (members.length >= 3 || members.some((member) => member.email === normalized)) return false;
    const [ownerMember] = await tx.select({ email: giftMembers.email }).from(giftMembers)
      .where(and(eq(giftMembers.giftId, giftId), eq(giftMembers.role, "owner"))).limit(1);
    if (!ownerMember) return false;
    const [blocked] = await tx.select({ id: userBlocks.id })
      .from(userBlocks)
      .where(blockedEmailPairCondition(ownerMember.email, normalized))
      .limit(1);
    if (blocked) throw new GiftRelationshipBlockedError();
    await tx.insert(giftMembers).values({ id: crypto.randomUUID(), giftId, email: normalized, role, createdAt });
    return true;
  });
}

export async function listGiftMembers(db: BackendDatabase, giftId: string) {
  return db.select({ email: giftMembers.email, role: giftMembers.role, createdAt: giftMembers.createdAt })
    .from(giftMembers)
    .where(eq(giftMembers.giftId, giftId));
}

/** A member lookup intentionally returns no gift data for an unlisted email. */
export async function getGiftAccessByTokenHash(db: BackendDatabase, tokenHash: string, email: string) {
  const normalizedEmail = normalizeEmail(email);
  const [access] = await db.select({
    id: gifts.id,
    status: gifts.status,
    role: giftMembers.role,
    albumId: sharedAlbums.id,
    albumTitle: sharedAlbums.title,
    travelDate: sharedAlbums.travelDate,
    publishedAt: sharedAlbums.publishedAt,
    version: sharedAlbums.version,
  })
    .from(gifts)
    .innerJoin(giftMembers, eq(giftMembers.giftId, gifts.id))
    .leftJoin(users, eq(users.email, normalizedEmail))
    .leftJoin(giftContentReports, and(eq(giftContentReports.giftId, gifts.id), eq(giftContentReports.reporterUserId, users.id)))
    .leftJoin(sharedAlbums, eq(sharedAlbums.giftId, gifts.id))
    .where(and(
      eq(gifts.tokenHash, tokenHash),
      eq(giftMembers.email, normalizedEmail),
      or(eq(giftMembers.role, "owner"), isNull(giftContentReports.id)),
    ))
    .limit(1);
  return access ?? null;
}

export async function updateGiftMemberRole(db: BackendDatabase, giftId: string, email: string, role: "viewer" | "editor"): Promise<boolean> {
  if (role !== "viewer" && role !== "editor") return false;
  const normalized = normalizeEmail(email);
  return db.transaction(async (tx) => {
    const locked = await tx.update(gifts).set({ createdAt: sql`${gifts.createdAt}` }).where(eq(gifts.id, giftId)).returning({ id: gifts.id });
    if (!locked.length) return false;
    const [ownerMember] = await tx.select({ email: giftMembers.email }).from(giftMembers)
      .where(and(eq(giftMembers.giftId, giftId), eq(giftMembers.role, "owner"))).limit(1);
    if (!ownerMember) return false;
    const [blocked] = await tx.select({ id: userBlocks.id })
      .from(userBlocks)
      .where(blockedEmailPairCondition(ownerMember.email, normalized))
      .limit(1);
    if (blocked) throw new GiftRelationshipBlockedError();
    const rows = await tx.update(giftMembers).set({ role }).where(and(
      eq(giftMembers.giftId, giftId), eq(giftMembers.email, normalized),
      or(eq(giftMembers.role, "viewer"), eq(giftMembers.role, "editor")),
    )).returning({ id: giftMembers.id });
    return rows.length === 1;
  });
}

export type GiftManagementAction = "delete_album" | "remove_member" | "change_member_role";
export type GiftManagementRequestDto = {
  id: string; action: GiftManagementAction; targetEmail: string | null;
  targetRole: "viewer" | "editor" | null; status: "pending" | "approved" | "rejected";
  createdAt: string; decidedAt: string | null;
};

export async function listGiftManagementTargetsForEditor(db: BackendDatabase, input: { giftId: string; userId: string; email: string }): Promise<{ email: string; role: "viewer" | "editor" }[] | null> {
  const requesterEmail = normalizeEmail(input.email);
  const [requester] = await db.select({ id: giftMembers.id }).from(gifts)
    .innerJoin(giftMembers, eq(giftMembers.giftId, gifts.id))
    .innerJoin(giftMemberActivations, eq(giftMemberActivations.memberId, giftMembers.id))
    .leftJoin(giftContentReports, and(eq(giftContentReports.giftId, gifts.id), eq(giftContentReports.reporterUserId, input.userId)))
    .where(and(eq(gifts.id, input.giftId), eq(gifts.status, "bound"), eq(giftMembers.email, requesterEmail), eq(giftMembers.role, "editor"), eq(giftMemberActivations.userId, input.userId), isNull(giftContentReports.id))).limit(1);
  if (!requester) return null;
  const members = await db.select({ email: giftMembers.email, role: giftMembers.role }).from(giftMembers)
    .where(and(eq(giftMembers.giftId, input.giftId), or(eq(giftMembers.role, "viewer"), eq(giftMembers.role, "editor"))));
  return members.filter(member => member.email !== requesterEmail).map(member => ({ email: member.email, role: member.role as "viewer" | "editor" }));
}

export async function createGiftManagementRequest(db: BackendDatabase, input: {
  giftId: string; userId: string; email: string; action: GiftManagementAction;
  targetEmail?: string; targetRole?: "viewer" | "editor"; now: string;
}): Promise<{ status: "created"; request: GiftManagementRequestDto } | { status: "forbidden" | "invalid_target" | "duplicate" }> {
  const targetEmail = input.targetEmail ? normalizeEmail(input.targetEmail) : null;
  if (input.action === "delete_album") {
    if (targetEmail || input.targetRole) return { status: "invalid_target" };
  } else if (!targetEmail || (input.action === "remove_member" && input.targetRole) || (input.action === "change_member_role" && !input.targetRole)) {
    return { status: "invalid_target" };
  }
  return db.transaction(async (tx) => {
    const lockedGift = await tx.update(gifts).set({ createdAt: sql`${gifts.createdAt}` }).where(and(eq(gifts.id, input.giftId), eq(gifts.status, "bound"))).returning({ id: gifts.id });
    if (!lockedGift.length) return { status: "forbidden" as const };
    const [requester] = await tx.select({ memberId: giftMembers.id, email: giftMembers.email })
      .from(gifts).innerJoin(giftMembers, eq(giftMembers.giftId, gifts.id))
      .innerJoin(giftMemberActivations, eq(giftMemberActivations.memberId, giftMembers.id))
      .leftJoin(giftContentReports, and(eq(giftContentReports.giftId, gifts.id), eq(giftContentReports.reporterUserId, input.userId)))
      .where(and(eq(gifts.id, input.giftId), eq(gifts.status, "bound"), eq(giftMembers.email, normalizeEmail(input.email)), eq(giftMembers.role, "editor"), eq(giftMemberActivations.userId, input.userId), isNull(giftContentReports.id))).limit(1);
    if (!requester) return { status: "forbidden" as const };
    if (input.action === "delete_album") {
      const [album] = await tx.select({ id: sharedAlbums.id }).from(sharedAlbums).where(eq(sharedAlbums.giftId, input.giftId)).limit(1);
      if (!album) return { status: "invalid_target" as const };
    }
    if (targetEmail) {
      const [target] = await tx.select({ role: giftMembers.role }).from(giftMembers)
        .where(and(eq(giftMembers.giftId, input.giftId), eq(giftMembers.email, targetEmail))).limit(1);
      if (!target || target.role === "owner" || targetEmail === requester.email) return { status: "invalid_target" as const };
    }
    const duplicateWhere = and(eq(giftManagementRequests.giftId, input.giftId), eq(giftManagementRequests.action, input.action), eq(giftManagementRequests.status, "pending"), targetEmail ? eq(giftManagementRequests.targetEmail, targetEmail) : isNull(giftManagementRequests.targetEmail), input.targetRole ? eq(giftManagementRequests.targetRole, input.targetRole) : isNull(giftManagementRequests.targetRole));
    if ((await tx.select({ id: giftManagementRequests.id }).from(giftManagementRequests).where(duplicateWhere).limit(1))[0]) return { status: "duplicate" as const };
    const [row] = await tx.insert(giftManagementRequests).values({ id: crypto.randomUUID(), giftId: input.giftId, requesterMemberId: requester.memberId, action: input.action, targetEmail, targetRole: input.targetRole ?? null, status: "pending", createdAt: input.now, decidedAt: null }).onConflictDoNothing().returning();
    if (!row) return { status: "duplicate" as const };
    return { status: "created" as const, request: { id: row.id, action: row.action, targetEmail: row.targetEmail, targetRole: row.targetRole, status: row.status, createdAt: row.createdAt, decidedAt: row.decidedAt } };
  });
}

export async function listGiftManagementRequestsForOwner(db: BackendDatabase, giftId: string, ownerEmail: string): Promise<GiftManagementRequestDto[] | null> {
  const [owner] = await db.select({ id: giftMembers.id }).from(gifts).innerJoin(giftMembers, eq(giftMembers.giftId, gifts.id))
    .where(and(eq(gifts.id, giftId), eq(gifts.status, "bound"), eq(giftMembers.email, normalizeEmail(ownerEmail)), eq(giftMembers.role, "owner"))).limit(1);
  if (!owner) return null;
  return db.select({ id: giftManagementRequests.id, action: giftManagementRequests.action, targetEmail: giftManagementRequests.targetEmail, targetRole: giftManagementRequests.targetRole, status: giftManagementRequests.status, createdAt: giftManagementRequests.createdAt, decidedAt: giftManagementRequests.decidedAt })
    .from(giftManagementRequests).where(eq(giftManagementRequests.giftId, giftId)).orderBy(giftManagementRequests.createdAt);
}

export async function decideGiftManagementRequest(db: BackendDatabase, input: { giftId: string; requestId: string; ownerEmail: string; decision: "approved" | "rejected"; now: string }): Promise<{ status: "approved" | "rejected" | "forbidden" | "not_pending" | "requester_ineligible" | "invalid_target" }> {
  return db.transaction(async (tx) => {
    const lockedGift = await tx.update(gifts).set({ createdAt: sql`${gifts.createdAt}` }).where(and(eq(gifts.id, input.giftId), eq(gifts.status, "bound"))).returning({ id: gifts.id });
    if (!lockedGift.length) return { status: "forbidden" as const };
    const [owner] = await tx.select({ id: giftMembers.id }).from(giftMembers).where(and(eq(giftMembers.giftId, input.giftId), eq(giftMembers.email, normalizeEmail(input.ownerEmail)), eq(giftMembers.role, "owner"))).limit(1);
    if (!owner) return { status: "forbidden" as const };
    const [request] = await tx.select().from(giftManagementRequests).where(and(eq(giftManagementRequests.id, input.requestId), eq(giftManagementRequests.giftId, input.giftId))).limit(1);
    if (!request || request.status !== "pending") return { status: "not_pending" as const };
    if (input.decision === "rejected") {
      await tx.update(giftManagementRequests).set({ status: "rejected", decidedAt: input.now }).where(and(eq(giftManagementRequests.id, request.id), eq(giftManagementRequests.status, "pending")));
      return { status: "rejected" as const };
    }
    const [requester] = await tx.select({ id: giftMembers.id }).from(giftMembers).innerJoin(giftMemberActivations, eq(giftMemberActivations.memberId, giftMembers.id))
      .where(and(eq(giftMembers.giftId, input.giftId), eq(giftMembers.id, request.requesterMemberId), eq(giftMembers.role, "editor"))).limit(1);
    if (!requester) return { status: "requester_ineligible" as const };
    let applyApprovedAction: () => Promise<void>;
    if (request.action === "remove_member") {
      const [target] = await tx.select({ id: giftMembers.id, role: giftMembers.role, userId: giftMemberActivations.userId })
        .from(giftMembers)
        .leftJoin(giftMemberActivations, eq(giftMemberActivations.memberId, giftMembers.id))
        .where(and(eq(giftMembers.giftId, input.giftId), eq(giftMembers.email, request.targetEmail!))).limit(1);
      if (!target || target.role === "owner" || target.id === requester.id) return { status: "invalid_target" as const };
      applyApprovedAction = async () => {
        await recordGiftRelationshipTombstone(tx, {
          giftId: input.giftId,
          email: request.targetEmail!,
          userId: target.userId,
          createdAt: input.now,
        });
        await tx.delete(giftMembers).where(and(eq(giftMembers.giftId, input.giftId), eq(giftMembers.id, target.id)));
      };
    } else if (request.action === "change_member_role") {
      const targetRole = request.targetRole;
      const [target] = await tx.select({ id: giftMembers.id, role: giftMembers.role }).from(giftMembers).where(and(eq(giftMembers.giftId, input.giftId), eq(giftMembers.email, request.targetEmail!))).limit(1);
      if (!target || target.role === "owner" || target.id === requester.id || (targetRole !== "viewer" && targetRole !== "editor")) return { status: "invalid_target" as const };
      const [blocked] = await tx.select({ id: userBlocks.id }).from(userBlocks)
        .where(blockedEmailPairCondition(input.ownerEmail, request.targetEmail!))
        .limit(1);
      if (blocked) throw new GiftRelationshipBlockedError();
      applyApprovedAction = async () => {
        await tx.update(giftMembers).set({ role: targetRole }).where(and(eq(giftMembers.giftId, input.giftId), eq(giftMembers.id, target.id)));
      };
    } else if (request.action === "delete_album") {
      const [album] = await tx.select({ id: sharedAlbums.id, coverObjectKey: sharedAlbums.coverObjectKey }).from(sharedAlbums).where(eq(sharedAlbums.giftId, input.giftId)).limit(1);
      if (!album) return { status: "invalid_target" as const };
      const media = await tx.select({ objectKey: sharedAlbumMedia.objectKey }).from(sharedAlbumMedia).where(eq(sharedAlbumMedia.sharedAlbumId, album.id));
      const keys = [...new Set([...media.map(row => row.objectKey), ...(album.coverObjectKey ? [album.coverObjectKey] : [])])];
      applyApprovedAction = async () => {
        if (keys.length) await tx.insert(giftMediaCleanupJobs).values(keys.map(objectKey => ({ id: crypto.randomUUID(), giftId: input.giftId, objectKey, state: "pending", attempts: 0, nextAttemptAt: input.now, leaseUntil: null, lastError: null, completedAt: null, createdAt: input.now }))).onConflictDoNothing();
        await tx.delete(sharedAlbums).where(eq(sharedAlbums.id, album.id));
      };
    } else return { status: "invalid_target" as const };
    const decided = await tx.update(giftManagementRequests).set({ status: "approved", decidedAt: input.now }).where(and(eq(giftManagementRequests.id, request.id), eq(giftManagementRequests.status, "pending"))).returning({ id: giftManagementRequests.id });
    if (!decided.length) return { status: "not_pending" as const };
    await applyApprovedAction();
    return { status: "approved" as const };
  });
}

/** Non-token lookup for the viewer read routes; never exposes token data. */
export async function getActivatedGiftAccessByGiftId(db: BackendDatabase, giftId: string, userId: string, email: string) {
  const [access] = await db.select({
    memberId: giftMembers.id,
    id: gifts.id,
    status: gifts.status,
    role: giftMembers.role,
    albumId: sharedAlbums.id,
    albumTitle: sharedAlbums.title,
    travelDate: sharedAlbums.travelDate,
    publishedAt: sharedAlbums.publishedAt,
    version: sharedAlbums.version,
    coverObjectKey: sharedAlbums.coverObjectKey,
    coverContentType: sharedAlbums.coverContentType,
    coverByteSize: sharedAlbums.coverByteSize,
  })
    .from(gifts)
    .innerJoin(giftMembers, eq(giftMembers.giftId, gifts.id))
    .innerJoin(giftMemberActivations, eq(giftMemberActivations.memberId, giftMembers.id))
    .leftJoin(giftContentReports, and(eq(giftContentReports.giftId, gifts.id), eq(giftContentReports.reporterUserId, userId)))
    .leftJoin(sharedAlbums, eq(sharedAlbums.giftId, gifts.id))
    .where(and(eq(gifts.id, giftId), eq(gifts.status, "bound"), eq(giftMembers.email, normalizeEmail(email)), or(eq(giftMembers.role, "viewer"), eq(giftMembers.role, "editor")), eq(giftMemberActivations.userId, userId), isNull(giftContentReports.id)))
    .limit(1);
  return access ?? null;
}

/** Owners cannot be removed and ownership is deliberately not transferable. */
export async function removeGiftMember(db: BackendDatabase, giftId: string, email: string, removedAt = new Date().toISOString()): Promise<boolean> {
  return db.transaction(async (tx) => {
    const locked = await tx.update(gifts).set({ createdAt: sql`${gifts.createdAt}` }).where(eq(gifts.id, giftId)).returning({ id: gifts.id });
    if (!locked.length) return false;
    const [member] = await tx.select({ id: giftMembers.id, email: giftMembers.email, userId: giftMemberActivations.userId })
      .from(giftMembers)
      .leftJoin(giftMemberActivations, eq(giftMemberActivations.memberId, giftMembers.id))
      .where(and(
      eq(giftMembers.giftId, giftId), eq(giftMembers.email, normalizeEmail(email)),
      or(eq(giftMembers.role, "viewer"), eq(giftMembers.role, "editor")),
    )).limit(1);
    if (!member) return false;
    await recordGiftRelationshipTombstone(tx, {
      giftId,
      email: member.email,
      userId: member.userId,
      createdAt: removedAt,
    });
    const result = await tx.delete(giftMembers)
      .where(and(eq(giftMembers.giftId, giftId), eq(giftMembers.id, member.id)))
      .returning({ id: giftMembers.id });
    return result.length === 1;
  });
}

export async function createGiftPublishSession(
  db: BackendDatabase,
  input: { id: string; giftId: string; ownerEmail: string; memberId?: string | null; actorUserId?: string | null; baseVersion: number; payload: GiftPublicationPayload; expiresAt: string; createdAt: string },
) {
  if (!Number.isInteger(input.baseVersion) || input.baseVersion! < 0) throw new GiftAlbumVersionConflictError();
  await db.transaction(async (tx) => {
    const email = normalizeEmail(input.ownerEmail);
    const [account] = await tx.select({ deletionState: users.deletionState }).from(users)
      .where(eq(users.email, email)).limit(1).for("update");
    if (account && account.deletionState !== "active") throw new GiftPublicationUnavailableError();
    await tx.execute(sql`select id from gifts where id = ${input.giftId} for update`);
    const [gift] = await tx.select({ id: gifts.id }).from(gifts).where(and(
      eq(gifts.id, input.giftId),
      eq(gifts.status, "bound"),
    )).limit(1);
    if (!gift) throw new GiftPublicationUnavailableError();
    await tx.insert(giftPublishSessions).values({
      id: input.id,
      giftId: input.giftId,
      ownerEmail: email,
      memberId: input.memberId ?? null,
      actorUserId: input.actorUserId ?? null,
      baseVersion: input.baseVersion!,
      payloadJson: input.payload,
      expiresAt: input.expiresAt,
      completedAt: null,
      createdAt: input.createdAt,
    });
  });
}

export async function getGiftPublishPayload(db: BackendDatabase, sessionId: string, giftId: string, ownerEmail: string, now: string): Promise<GiftPublicationPayload | null> {
  const [session] = await db.select({ payloadJson: giftPublishSessions.payloadJson }).from(giftPublishSessions).where(and(
    eq(giftPublishSessions.id, sessionId),
    eq(giftPublishSessions.giftId, giftId),
    eq(giftPublishSessions.ownerEmail, normalizeEmail(ownerEmail)),
    isNull(giftPublishSessions.completedAt),
    gt(giftPublishSessions.expiresAt, now),
  )).limit(1);
  return session ? session.payloadJson as GiftPublicationPayload : null;
}

export async function getGiftPublishCompletionReceipt(
  db: BackendDatabase,
  sessionId: string,
  giftId: string,
  ownerEmail: string,
): Promise<{ albumId: string; version: number } | null> {
  const [session] = await db.select({
    albumId: giftPublishSessions.completedAlbumId,
    version: giftPublishSessions.completedAlbumVersion,
  }).from(giftPublishSessions).where(and(
    eq(giftPublishSessions.id, sessionId),
    eq(giftPublishSessions.giftId, giftId),
    eq(giftPublishSessions.ownerEmail, normalizeEmail(ownerEmail)),
    isNotNull(giftPublishSessions.completedAt),
    isNotNull(giftPublishSessions.completedAlbumId),
    isNotNull(giftPublishSessions.completedAlbumVersion),
  )).limit(1);
  return session?.albumId && Number.isInteger(session.version)
    ? { albumId: session.albumId, version: session.version! }
    : null;
}

export async function completeGiftPublishSession(
  db: BackendDatabase,
  input: { sessionId: string; ownerEmail: string; now: string; payload?: GiftPublicationPayload },
): Promise<{ albumId: string; version: number; oldObjectKeys: string[]; replayed: boolean } | null> {
  const [candidate] = await db.select({
    giftId: giftPublishSessions.giftId,
    expiresAt: giftPublishSessions.expiresAt,
    completedAt: giftPublishSessions.completedAt,
    completedAlbumId: giftPublishSessions.completedAlbumId,
    completedAlbumVersion: giftPublishSessions.completedAlbumVersion,
  }).from(giftPublishSessions).where(and(
    eq(giftPublishSessions.id, input.sessionId),
    eq(giftPublishSessions.ownerEmail, normalizeEmail(input.ownerEmail)),
  )).limit(1);
  if (!candidate) return null;
  if (candidate.completedAt) {
    return candidate.completedAlbumId && Number.isInteger(candidate.completedAlbumVersion)
      ? { albumId: candidate.completedAlbumId, version: candidate.completedAlbumVersion!, oldObjectKeys: [], replayed: true }
      : null;
  }
  if (candidate.expiresAt <= input.now) return null;

  return withPublicationLock(candidate.giftId, () => db.transaction(async (tx) => {
    const email = normalizeEmail(input.ownerEmail);
    await tx.execute(sql`select id from gift_publish_sessions where id = ${input.sessionId} for update`);
    await tx.execute(sql`select id from gifts where id = ${candidate.giftId} for update`);
    const [session] = await tx.select().from(giftPublishSessions).where(and(
      eq(giftPublishSessions.id, input.sessionId),
      eq(giftPublishSessions.ownerEmail, email),
    )).limit(1);
    if (!session) return null;
    if (session.completedAt) {
      return session.completedAlbumId && Number.isInteger(session.completedAlbumVersion)
        ? { albumId: session.completedAlbumId, version: session.completedAlbumVersion!, oldObjectKeys: [], replayed: true }
        : null;
    }
    if (session.expiresAt <= input.now) return null;

    const [account] = await tx.select({ deletionState: users.deletionState }).from(users)
      .where(eq(users.email, email)).limit(1).for("update");
    if (account && account.deletionState !== "active") return null;

    const [liveGift] = await tx.select({ id: gifts.id }).from(gifts).where(and(eq(gifts.id, session.giftId), eq(gifts.status, "bound"))).limit(1);
    if (!liveGift) return null;
    const [owner] = await tx.select({ id: giftMembers.id }).from(giftMembers)
      .leftJoin(giftMemberActivations, eq(giftMemberActivations.memberId, giftMembers.id))
      .where(and(
      eq(giftMembers.giftId, session.giftId),
      eq(giftMembers.email, email),
      session.memberId
        ? and(eq(giftMembers.id, session.memberId), eq(giftMembers.role, "editor"), eq(giftMemberActivations.userId, session.actorUserId!))
        : eq(giftMembers.role, "owner"),
    )).limit(1);
    if (!owner) return null;

    const [current] = await tx.select().from(sharedAlbums).where(eq(sharedAlbums.giftId, session.giftId)).limit(1);
    if (session.baseVersion !== (current?.version ?? 0)) {
      throw new GiftAlbumVersionConflictError();
    }
    const oldMedia = current
      ? await tx.select({ objectKey: sharedAlbumMedia.objectKey }).from(sharedAlbumMedia).where(eq(sharedAlbumMedia.sharedAlbumId, current.id))
      : [];
    const oldCoverKey = current?.coverObjectKey ?? null;
    const sessionPayload = session.payloadJson as GiftPublicationPayload;
    const payload = input.payload ?? sessionPayload;
    const travelDate = Object.prototype.hasOwnProperty.call(payload, "travelDate") ? payload.travelDate ?? null : current?.travelDate ?? null;
    const albumId = current?.id ?? crypto.randomUUID();
    const version = (current?.version ?? 0) + 1;

    if (current) {
      await tx.delete(sharedAlbums).where(eq(sharedAlbums.id, current.id));
    }
    await tx.insert(sharedAlbums).values({
      id: albumId,
      giftId: session.giftId,
      sourceMemoryId: payload.sourceMemoryId,
      title: payload.title,
      travelDate,
      publishedAt: input.now,
      version,
      coverObjectKey: payload.cover?.objectKey ?? null,
      coverContentType: payload.cover?.contentType ?? null,
      coverByteSize: payload.cover?.byteSize ?? null,
    });
    if (payload.pages.length) await tx.insert(sharedAlbumPages).values(payload.pages.map((page) => ({
      id: crypto.randomUUID(), sharedAlbumId: albumId, position: page.position, pageJson: page.page,
    })));
    if (payload.media.length) await tx.insert(sharedAlbumMedia).values(payload.media.map((media) => ({
      id: crypto.randomUUID(), sharedAlbumId: albumId, ...media, createdAt: input.now,
    })));
    const retainedKeys = new Set(payload.media.map(media => media.objectKey));
    const oldObjectKeys = [...oldMedia.map((media) => media.objectKey).filter(key => !retainedKeys.has(key)), ...(oldCoverKey && oldCoverKey !== payload.cover?.objectKey ? [oldCoverKey] : [])];
    if (oldObjectKeys.length) await tx.insert(giftMediaCleanupJobs).values(oldObjectKeys.map((objectKey) => ({
      id: crypto.randomUUID(), giftId: session.giftId, objectKey, state: "pending", attempts: 0,
      nextAttemptAt: input.now, lastError: null, completedAt: null, createdAt: input.now,
    }))).onConflictDoNothing();
    const tempObjectKeys = [
      ...sessionPayload.media.filter((media) => media.source !== "existing" && media.objectKey.includes("/temp/")).map((media) => media.objectKey),
      ...(sessionPayload.cover?.objectKey.includes("/temp/") ? [sessionPayload.cover.objectKey] : []),
    ];
    if (tempObjectKeys.length) await tx.insert(giftMediaCleanupJobs).values(tempObjectKeys.map((objectKey) => ({
      id: crypto.randomUUID(), giftId: session.giftId, objectKey, state: "pending", attempts: 0,
      nextAttemptAt: input.now, lastError: null, completedAt: null, createdAt: input.now,
    }))).onConflictDoNothing();
    await tx.update(giftPublishSessions).set({
      completedAt: input.now,
      completedAlbumId: albumId,
      completedAlbumVersion: version,
    }).where(and(eq(giftPublishSessions.id, session.id), isNull(giftPublishSessions.completedAt)));
    return { albumId, version, oldObjectKeys, replayed: false };
  }));
}

export async function completeGiftPublishSessionResult(db: BackendDatabase, input: { sessionId: string; ownerEmail: string; now: string; payload?: GiftPublicationPayload }): Promise<
  | { status: "success"; albumId: string; version: number; oldObjectKeys: string[]; replayed: boolean }
  | { status: "conflict" }
  | { status: "access_denied" }
> {
  try {
    const result = await completeGiftPublishSession(db, input);
    return result ? { status: "success", ...result } : { status: "access_denied" };
  } catch (error) {
    if (error instanceof GiftAlbumVersionConflictError) return { status: "conflict" };
    throw error;
  }
}

export async function getSharedAlbumSnapshot(db: BackendDatabase, albumId: string) {
  const [album] = await db.select().from(sharedAlbums).where(eq(sharedAlbums.id, albumId)).limit(1);
  if (!album) return null;
  const [pages, media] = await Promise.all([
    db.select({ position: sharedAlbumPages.position, page: sharedAlbumPages.pageJson }).from(sharedAlbumPages).where(eq(sharedAlbumPages.sharedAlbumId, albumId)),
    db.select({ id: sharedAlbumMedia.id, position: sharedAlbumMedia.position, objectKey: sharedAlbumMedia.objectKey, contentType: sharedAlbumMedia.contentType, byteSize: sharedAlbumMedia.byteSize }).from(sharedAlbumMedia).where(eq(sharedAlbumMedia.sharedAlbumId, albumId)),
  ]);
  return { album, pages: pages.sort((a, b) => a.position - b.position), media: media.sort((a, b) => a.position - b.position) };
}

export async function getGiftMediaObjectKeys(db: BackendDatabase, giftId: string): Promise<string[]> {
  const rows = await db.select({ objectKey: sharedAlbumMedia.objectKey }).from(sharedAlbumMedia)
    .innerJoin(sharedAlbums, eq(sharedAlbumMedia.sharedAlbumId, sharedAlbums.id))
    .where(eq(sharedAlbums.giftId, giftId));
  return rows.map((row) => row.objectKey);
}

export async function disableGift(db: BackendDatabase, giftId: string, disabledAt: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const result = await tx.update(gifts).set({ status: "disabled", disabledAt }).where(and(eq(gifts.id, giftId), eq(gifts.status, "bound"))).returning({ id: gifts.id });
    if (!result.length) return false;
    const oldMedia = await tx.select({ objectKey: sharedAlbumMedia.objectKey }).from(sharedAlbumMedia)
      .innerJoin(sharedAlbums, eq(sharedAlbumMedia.sharedAlbumId, sharedAlbums.id))
      .where(eq(sharedAlbums.giftId, giftId));
    const [oldAlbum] = await tx.select({ coverObjectKey: sharedAlbums.coverObjectKey }).from(sharedAlbums).where(eq(sharedAlbums.giftId, giftId)).limit(1);
    const oldObjectKeys = [...oldMedia.map((media) => media.objectKey), ...(oldAlbum?.coverObjectKey ? [oldAlbum.coverObjectKey] : [])];
    if (oldObjectKeys.length) await tx.insert(giftMediaCleanupJobs).values(oldObjectKeys.map((objectKey) => ({
      id: crypto.randomUUID(), giftId, objectKey, state: "pending", attempts: 0,
      nextAttemptAt: disabledAt, lastError: null, completedAt: null, createdAt: disabledAt,
    }))).onConflictDoNothing();
    await tx.delete(giftMembers).where(eq(giftMembers.giftId, giftId));
    await tx.delete(sharedAlbums).where(eq(sharedAlbums.giftId, giftId));
    return true;
  });
}

export async function listGiftMediaCleanupJobs(db: BackendDatabase, now: string) {
  return db.select({ id: giftMediaCleanupJobs.id, giftId: giftMediaCleanupJobs.giftId, objectKey: giftMediaCleanupJobs.objectKey, state: giftMediaCleanupJobs.state, attempts: giftMediaCleanupJobs.attempts })
    .from(giftMediaCleanupJobs)
    .where(and(eq(giftMediaCleanupJobs.state, "pending"), lte(giftMediaCleanupJobs.nextAttemptAt, now)));
}

export async function enqueueGiftMediaCleanupJobs(db: BackendDatabase, giftId: string, objectKeys: string[], now: string): Promise<void> {
  const uniqueKeys = [...new Set(objectKeys)];
  if (!uniqueKeys.length) return;
  const nextAttemptAt = new Date(new Date(now).getTime() + 15 * 60_000).toISOString();
  await db.insert(giftMediaCleanupJobs).values(uniqueKeys.map((objectKey) => ({
    id: crypto.randomUUID(), giftId, objectKey, state: "pending" as const, attempts: 0,
    nextAttemptAt, leaseUntil: null, lastError: null, completedAt: null, createdAt: now,
  }))).onConflictDoNothing();
}

export async function reserveGiftPublicationPromotion(
  db: BackendDatabase,
  input: {
    giftId: string;
    sessionId: string;
    ownerEmail: string;
    objectKeys: string[];
    now: string;
  },
): Promise<void> {
  const email = normalizeEmail(input.ownerEmail);
  const uniqueKeys = [...new Set(input.objectKeys)];
  await db.transaction(async (tx) => {
    const [account] = await tx.select({ deletionState: users.deletionState }).from(users)
      .where(eq(users.email, email)).limit(1).for("update");
    if (account && account.deletionState !== "active") throw new GiftPublicationUnavailableError();
    await tx.execute(sql`select id from gift_publish_sessions where id = ${input.sessionId} for update`);
    const [session] = await tx.select({ id: giftPublishSessions.id }).from(giftPublishSessions).where(and(
      eq(giftPublishSessions.id, input.sessionId),
      eq(giftPublishSessions.giftId, input.giftId),
      eq(giftPublishSessions.ownerEmail, email),
      isNull(giftPublishSessions.completedAt),
      gt(giftPublishSessions.expiresAt, input.now),
    )).limit(1);
    if (!session) throw new GiftPublicationUnavailableError();
    await tx.execute(sql`select id from gifts where id = ${input.giftId} for update`);
    const [gift] = await tx.select({ id: gifts.id }).from(gifts).where(and(
      eq(gifts.id, input.giftId),
      eq(gifts.status, "bound"),
    )).limit(1);
    if (!gift) throw new GiftPublicationUnavailableError();
    if (uniqueKeys.length) {
      const nextAttemptAt = new Date(new Date(input.now).getTime() + 15 * 60_000).toISOString();
      await tx.insert(giftMediaCleanupJobs).values(uniqueKeys.map((objectKey) => ({
        id: crypto.randomUUID(), giftId: input.giftId, objectKey, state: "pending" as const, attempts: 0,
        nextAttemptAt, leaseUntil: null, lastError: null, completedAt: null, createdAt: input.now,
      }))).onConflictDoNothing();
    }
  });
}

export async function isGiftMediaObjectReferenced(db: BackendDatabase, objectKey: string): Promise<boolean> {
  const [media, cover] = await Promise.all([
    db.select({ id: sharedAlbumMedia.id }).from(sharedAlbumMedia).where(eq(sharedAlbumMedia.objectKey, objectKey)).limit(1),
    db.select({ id: sharedAlbums.id }).from(sharedAlbums).where(eq(sharedAlbums.coverObjectKey, objectKey)).limit(1),
  ]);
  return media.length > 0 || cover.length > 0;
}

export async function claimGiftMediaCleanupJobs(
  db: BackendDatabase,
  now: string,
  leaseUntil: string,
  requestedLimit = 50,
) {
  const limit = Math.max(1, Math.min(requestedLimit, 50));
  return db.transaction(async (tx) => {
    const selected = await tx.execute<{ id: string }>(sql`
      select id from gift_media_cleanup_jobs
      where (state = 'pending' and next_attempt_at <= ${now})
         or (state = 'processing' and lease_until <= ${now})
      order by next_attempt_at, id
      limit ${limit}
      for update skip locked
    `);
    const ids = selected.rows.map((row) => row.id);
    if (!ids.length) return [];
    const jobs = await tx.update(giftMediaCleanupJobs).set({
      state: "processing",
      leaseUntil,
      attempts: sql`${giftMediaCleanupJobs.attempts} + 1`,
    }).where(inArray(giftMediaCleanupJobs.id, ids)).returning({
      id: giftMediaCleanupJobs.id,
      giftId: giftMediaCleanupJobs.giftId,
      objectKey: giftMediaCleanupJobs.objectKey,
      state: giftMediaCleanupJobs.state,
      attempts: giftMediaCleanupJobs.attempts,
    });
    const order = new Map(ids.map((id, index) => [id, index]));
    return jobs.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
  });
}

export async function completeGiftMediaCleanupJob(db: BackendDatabase, id: string, now: string) {
  await db.update(giftMediaCleanupJobs).set({ state: "completed", completedAt: now, leaseUntil: null, lastError: null }).where(and(eq(giftMediaCleanupJobs.id, id), eq(giftMediaCleanupJobs.state, "processing")));
}

export async function failGiftMediaCleanupJob(db: BackendDatabase, id: string, errorCode: string, now: string, nextAttemptAt: string) {
  const [result] = await db.update(giftMediaCleanupJobs).set({
    state: sql`case when ${giftMediaCleanupJobs.attempts} >= 10 then 'dead_letter' else 'pending' end`,
    lastError: errorCode.slice(0, 100),
    nextAttemptAt,
    leaseUntil: null,
    completedAt: sql`case when ${giftMediaCleanupJobs.attempts} >= 10 then ${now} else null end`,
  }).where(and(eq(giftMediaCleanupJobs.id, id), eq(giftMediaCleanupJobs.state, "processing")))
    .returning({ state: giftMediaCleanupJobs.state });
  return result?.state ?? null;
}

export async function purgeGiftMaintenanceData(
  db: BackendDatabase,
  input: { publishCutoff: string; jobCutoff: string; limit: number },
): Promise<{ publishSessions: number; cleanupJobs: number }> {
  const limit = Math.max(1, Math.min(input.limit, 100));
  const publishIds = await db.select({ id: giftPublishSessions.id }).from(giftPublishSessions).where(and(
    isNotNull(giftPublishSessions.completedAt),
    lte(giftPublishSessions.completedAt, input.publishCutoff),
  )).limit(limit);
  const cleanupIds = await db.select({ id: giftMediaCleanupJobs.id }).from(giftMediaCleanupJobs).where(and(
    or(eq(giftMediaCleanupJobs.state, "completed"), eq(giftMediaCleanupJobs.state, "dead_letter")),
    isNotNull(giftMediaCleanupJobs.completedAt),
    lte(giftMediaCleanupJobs.completedAt, input.jobCutoff),
  )).limit(limit);
  const publishSessions = publishIds.length
    ? await db.delete(giftPublishSessions).where(inArray(giftPublishSessions.id, publishIds.map((row) => row.id))).returning({ id: giftPublishSessions.id })
    : [];
  const cleanupJobs = cleanupIds.length
    ? await db.delete(giftMediaCleanupJobs).where(inArray(giftMediaCleanupJobs.id, cleanupIds.map((row) => row.id))).returning({ id: giftMediaCleanupJobs.id })
    : [];
  return { publishSessions: publishSessions.length, cleanupJobs: cleanupJobs.length };
}

/** Expired, unfinished publication uploads are never made visible and are queued for deletion. */
export async function expireGiftPublishSessions(db: BackendDatabase, now: string, requestedLimit = 50): Promise<number> {
  return db.transaction(async (tx) => {
    const limit = Math.max(1, Math.min(requestedLimit, 50));
    const selected = await tx.execute<{ id: string }>(sql`
      select id from gift_publish_sessions
      where completed_at is null and expires_at <= ${now}
      order by expires_at, id
      limit ${limit}
      for update skip locked
    `);
    const ids = selected.rows.map((row) => row.id);
    if (!ids.length) return 0;
    const sessions = await tx.update(giftPublishSessions).set({ completedAt: now }).where(and(
      inArray(giftPublishSessions.id, ids),
      isNull(giftPublishSessions.completedAt),
      lte(giftPublishSessions.expiresAt, now),
    )).returning();
    for (const session of sessions) {
      const payload = session.payloadJson as GiftPublicationPayload;
      const objectKeys = [...payload.media.filter((media) => media.source !== "existing").map((media) => media.objectKey), ...(payload.cover?.objectKey ? [payload.cover.objectKey] : [])];
      if (objectKeys.length) await tx.insert(giftMediaCleanupJobs).values(objectKeys.map((objectKey) => ({
        id: crypto.randomUUID(), giftId: session.giftId, objectKey, state: "pending", attempts: 0,
        nextAttemptAt: now, lastError: null, completedAt: null, createdAt: now,
      }))).onConflictDoNothing();
    }
    return sessions.length;
  });
}

export async function createInitializingGiftCard(
  db: BackendDatabase,
  input: { cardId: string; cardCode: string; giftId: string; tokenHash: string; note: string | null; adminEmail: string; createdAt: string; expiresAt: string },
) : Promise<{ displayNumber: number }> {
  const email = normalizeEmail(input.adminEmail);
  return db.transaction(async (tx) => {
    await tx.insert(gifts).values({ id: input.giftId, tokenHash: input.tokenHash, status: "initializing", createdAt: input.createdAt, claimedAt: null, disabledAt: null });
    const [card] = await tx.insert(giftCards).values({ id: input.cardId, code: input.cardCode, state: "initializing", giftId: input.giftId, name: null, note: input.note, createdByEmail: email, expiresAt: input.expiresAt, activatedAt: null, retiredAt: null, createdAt: input.createdAt }).returning({ displayNumber: giftCards.displayNumber });
    await tx.insert(giftCardEvents).values({ id: crypto.randomUUID(), cardId: input.cardId, kind: "initialization_started", actorEmail: email, metadataJson: null, createdAt: input.createdAt });
    return card;
  });
}

export async function activateGiftCard(db: BackendDatabase, cardId: string, adminEmail: string, now: string): Promise<boolean> {
  const email = normalizeEmail(adminEmail);
  return db.transaction(async (tx) => {
    const [card] = await tx.select().from(giftCards).where(and(eq(giftCards.id, cardId), eq(giftCards.state, "initializing"), eq(giftCards.createdByEmail, email), gt(giftCards.expiresAt, now))).limit(1);
    if (!card?.giftId) return false;
    const updated = await tx.update(giftCards).set({ state: "active", activatedAt: now, expiresAt: null }).where(and(eq(giftCards.id, cardId), eq(giftCards.state, "initializing"))).returning({ id: giftCards.id });
    if (!updated.length) return false;
    await tx.update(gifts).set({ status: "unclaimed" }).where(and(eq(gifts.id, card.giftId), eq(gifts.status, "initializing")));
    await tx.insert(giftCardEvents).values({ id: crypto.randomUUID(), cardId, kind: "activated", actorEmail: email, metadataJson: null, createdAt: now });
    return true;
  });
}

export async function expireGiftCardReservations(db: BackendDatabase, now: string, requestedLimit = 50): Promise<number> {
  return db.transaction(async (tx) => {
    const limit = Math.max(1, Math.min(requestedLimit, 50));
    const cards = await tx.select().from(giftCards).where(and(eq(giftCards.state, "initializing"), lte(giftCards.expiresAt, now))).limit(limit);
    let expired = 0;
    for (const card of cards) {
      const updated = await tx.update(giftCards).set({ state: "retired", retiredAt: now }).where(and(
        eq(giftCards.id, card.id),
        eq(giftCards.state, "initializing"),
        lte(giftCards.expiresAt, now),
      )).returning({ id: giftCards.id });
      if (!updated.length) continue;
      if (card.giftId) await tx.update(gifts).set({ status: "disabled", disabledAt: now }).where(and(eq(gifts.id, card.giftId), eq(gifts.status, "initializing")));
      await tx.insert(giftCardEvents).values({ id: crypto.randomUUID(), cardId: card.id, kind: "initialization_expired", actorEmail: card.createdByEmail, metadataJson: null, createdAt: now });
      expired += 1;
    }
    return expired;
  });
}

export type GiftCardFilters = { state?: string; search?: string };

const adminGiftCardSelection = {
  id: giftCards.id,
  displayNumber: giftCards.displayNumber,
  name: giftCards.name,
  state: giftCards.state,
  note: giftCards.note,
  giftId: giftCards.giftId,
  giftStatus: gifts.status,
  createdAt: giftCards.createdAt,
  activatedAt: giftCards.activatedAt,
  retiredAt: giftCards.retiredAt,
};

export async function listGiftCards(db: BackendDatabase, filters: GiftCardFilters = {}) {
  const predicates = [];
  if (filters.state) predicates.push(eq(giftCards.state, filters.state));
  if (filters.search) predicates.push(or(
    ilike(sql`${giftCards.displayNumber}::text`, `%${filters.search}%`),
    ilike(giftCards.name, `%${filters.search}%`),
    ilike(giftCards.note, `%${filters.search}%`),
  ));
  return db.select(adminGiftCardSelection)
    .from(giftCards)
    .leftJoin(gifts, eq(giftCards.giftId, gifts.id))
    .where(predicates.length ? and(...predicates) : undefined)
    .orderBy(giftCards.displayNumber);
}

export async function getGiftCardDetails(db: BackendDatabase, cardId: string) {
  const [card] = await db.select({ ...adminGiftCardSelection, expiresAt: giftCards.expiresAt })
    .from(giftCards)
    .leftJoin(gifts, eq(giftCards.giftId, gifts.id))
    .where(eq(giftCards.id, cardId))
    .limit(1);
  if (!card) return null;
  const events = await db.select({ id: giftCardEvents.id, kind: giftCardEvents.kind, actorEmail: giftCardEvents.actorEmail, metadata: giftCardEvents.metadataJson, createdAt: giftCardEvents.createdAt })
    .from(giftCardEvents)
    .where(eq(giftCardEvents.cardId, cardId))
    .orderBy(giftCardEvents.createdAt);
  return { card, events };
}

export async function updateGiftCardMetadata(
  db: BackendDatabase,
  cardId: string,
  input: { name?: string | null; note?: string | null },
  adminEmail: string,
  now: string,
) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: giftCards.id }).from(giftCards).where(eq(giftCards.id, cardId)).limit(1);
    if (!existing) return null;
    const values: { name?: string | null; note?: string | null } = {};
    const fields: string[] = [];
    if (Object.hasOwn(input, "name")) {
      values.name = input.name?.trim() || null;
      fields.push("name");
    }
    if (Object.hasOwn(input, "note")) {
      values.note = input.note?.trim() || null;
      fields.push("note");
    }
    await tx.update(giftCards).set(values).where(eq(giftCards.id, cardId));
    await tx.insert(giftCardEvents).values({
      id: crypto.randomUUID(),
      cardId,
      kind: "metadata_updated",
      actorEmail: normalizeEmail(adminEmail),
      metadataJson: { fields },
      createdAt: now,
    });
    const [card] = await tx.select(adminGiftCardSelection).from(giftCards).leftJoin(gifts, eq(giftCards.giftId, gifts.id)).where(eq(giftCards.id, cardId)).limit(1);
    return card;
  });
}

/** A card may only be retired before its gift is claimed. */
export async function retireGiftCard(db: BackendDatabase, cardId: string, adminEmail: string, now: string): Promise<boolean> {
  const email = normalizeEmail(adminEmail);
  return db.transaction(async (tx) => {
    const [card] = await tx.select().from(giftCards).where(and(eq(giftCards.id, cardId), eq(giftCards.state, "active"))).limit(1);
    if (!card?.giftId) return false;
    const [gift] = await tx.select({ id: gifts.id }).from(gifts).where(and(eq(gifts.id, card.giftId), eq(gifts.status, "unclaimed"))).limit(1);
    if (!gift) return false;
    const disabled = await tx.update(gifts).set({ status: "disabled", disabledAt: now }).where(and(eq(gifts.id, gift.id), eq(gifts.status, "unclaimed"))).returning({ id: gifts.id });
    if (!disabled.length) return false;
    const retired = await tx.update(giftCards).set({ state: "retired", retiredAt: now }).where(and(eq(giftCards.id, cardId), eq(giftCards.state, "active"))).returning({ id: giftCards.id });
    if (!retired.length) throw new Error("Gift card state changed during retirement");
    await tx.insert(giftCardEvents).values({ id: crypto.randomUUID(), cardId, kind: "retired", actorEmail: email, metadataJson: null, createdAt: now });
    return true;
  });
}
