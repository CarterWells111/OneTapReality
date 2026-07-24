import { and, eq, gt, ilike, isNull, lte } from "drizzle-orm";

import type { BackendDatabase } from "../db/client";
import { giftCardEvents, giftCards, giftEmailCodes, giftMembers, giftPublishSessions, giftSessions, gifts, sharedAlbumMedia, sharedAlbumPages, sharedAlbums } from "../db/schema";

export type GiftPublicationPayload = {
  sourceMemoryId: string;
  title: string;
  pages: { position: number; page: unknown }[];
  media: { position: number; objectKey: string; contentType: string; byteSize: number }[];
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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
  const [gift] = await db.select().from(gifts)
    .where(and(eq(gifts.tokenHash, tokenHash), eq(gifts.status, "unclaimed")))
    .limit(1);
  if (!gift) return null;

  const ownerEmail = normalizeEmail(email);
  const updated = await db.update(gifts)
    .set({ status: "bound", claimedAt })
    .where(and(eq(gifts.id, gift.id), eq(gifts.status, "unclaimed")))
    .returning({ id: gifts.id });
  if (updated.length !== 1) return null;

  await db.insert(giftMembers).values({
    id: crypto.randomUUID(),
    giftId: gift.id,
    email: ownerEmail,
    role: "owner",
    createdAt: claimedAt,
  });
  return { id: gift.id, status: "bound", ownerEmail };
}

export async function listOwnedGifts(db: BackendDatabase, email: string) {
  const ownerEmail = normalizeEmail(email);
  const rows = await db.select({ id: gifts.id, status: gifts.status, claimedAt: gifts.claimedAt })
    .from(gifts)
    .innerJoin(giftMembers, eq(giftMembers.giftId, gifts.id))
    .where(and(eq(giftMembers.email, ownerEmail), eq(giftMembers.role, "owner")));
  return rows;
}

export async function addGiftMember(db: BackendDatabase, giftId: string, email: string, createdAt: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  const members = await db.select({ email: giftMembers.email }).from(giftMembers).where(eq(giftMembers.giftId, giftId));
  if (members.length >= 3 || members.some((member) => member.email === normalized)) return false;
  await db.insert(giftMembers).values({ id: crypto.randomUUID(), giftId, email: normalized, role: "viewer", createdAt });
  return true;
}

export async function listGiftMembers(db: BackendDatabase, giftId: string) {
  return db.select({ email: giftMembers.email, role: giftMembers.role, createdAt: giftMembers.createdAt })
    .from(giftMembers)
    .where(eq(giftMembers.giftId, giftId));
}

/** A member lookup intentionally returns no gift data for an unlisted email. */
export async function getGiftAccessByTokenHash(db: BackendDatabase, tokenHash: string, email: string) {
  const [access] = await db.select({
    id: gifts.id,
    status: gifts.status,
    role: giftMembers.role,
    albumId: sharedAlbums.id,
    albumTitle: sharedAlbums.title,
    publishedAt: sharedAlbums.publishedAt,
    version: sharedAlbums.version,
  })
    .from(gifts)
    .innerJoin(giftMembers, eq(giftMembers.giftId, gifts.id))
    .leftJoin(sharedAlbums, eq(sharedAlbums.giftId, gifts.id))
    .where(and(eq(gifts.tokenHash, tokenHash), eq(giftMembers.email, normalizeEmail(email))))
    .limit(1);
  return access ?? null;
}

/** Owners cannot be removed and ownership is deliberately not transferable. */
export async function removeGiftMember(db: BackendDatabase, giftId: string, email: string): Promise<boolean> {
  const result = await db.delete(giftMembers).where(and(
    eq(giftMembers.giftId, giftId),
    eq(giftMembers.email, normalizeEmail(email)),
    eq(giftMembers.role, "viewer"),
  )).returning({ id: giftMembers.id });
  return result.length === 1;
}

export async function createGiftEmailCode(db: BackendDatabase, input: { id: string; email: string; codeHash: string; expiresAt: string; createdAt: string }) {
  await db.insert(giftEmailCodes).values({ ...input, email: normalizeEmail(input.email), consumedAt: null });
}

export async function isGiftEmailCodeRateLimited(db: BackendDatabase, email: string, since: string): Promise<boolean> {
  const recent = await db.select({ id: giftEmailCodes.id }).from(giftEmailCodes).where(and(
    eq(giftEmailCodes.email, normalizeEmail(email)),
    gt(giftEmailCodes.createdAt, since),
  )).limit(5);
  return recent.length >= 5;
}

export async function consumeGiftEmailCode(db: BackendDatabase, email: string, codeHash: string, now: string): Promise<boolean> {
  const [code] = await db.select({ id: giftEmailCodes.id }).from(giftEmailCodes).where(and(
    eq(giftEmailCodes.email, normalizeEmail(email)), eq(giftEmailCodes.codeHash, codeHash), isNull(giftEmailCodes.consumedAt), gt(giftEmailCodes.expiresAt, now),
  )).limit(1);
  if (!code) return false;
  const result = await db.update(giftEmailCodes).set({ consumedAt: now }).where(and(eq(giftEmailCodes.id, code.id), isNull(giftEmailCodes.consumedAt))).returning({ id: giftEmailCodes.id });
  return result.length === 1;
}

export async function createGiftSession(db: BackendDatabase, input: { id: string; email: string; tokenHash: string; expiresAt: string; createdAt: string }) {
  await db.insert(giftSessions).values({ ...input, email: normalizeEmail(input.email), revokedAt: null });
}

export async function getGiftSessionEmail(db: BackendDatabase, tokenHash: string, now: string): Promise<string | null> {
  const [session] = await db.select({ email: giftSessions.email }).from(giftSessions).where(and(
    eq(giftSessions.tokenHash, tokenHash), isNull(giftSessions.revokedAt), gt(giftSessions.expiresAt, now),
  )).limit(1);
  return session?.email ?? null;
}

export async function createGiftPublishSession(
  db: BackendDatabase,
  input: { id: string; giftId: string; ownerEmail: string; payload: GiftPublicationPayload; expiresAt: string; createdAt: string },
) {
  await db.insert(giftPublishSessions).values({
    id: input.id,
    giftId: input.giftId,
    ownerEmail: normalizeEmail(input.ownerEmail),
    payloadJson: input.payload,
    expiresAt: input.expiresAt,
    completedAt: null,
    createdAt: input.createdAt,
  });
}

export async function getGiftPublishPayload(db: BackendDatabase, sessionId: string, ownerEmail: string, now: string): Promise<GiftPublicationPayload | null> {
  const [session] = await db.select({ payloadJson: giftPublishSessions.payloadJson }).from(giftPublishSessions).where(and(
    eq(giftPublishSessions.id, sessionId),
    eq(giftPublishSessions.ownerEmail, normalizeEmail(ownerEmail)),
    isNull(giftPublishSessions.completedAt),
    gt(giftPublishSessions.expiresAt, now),
  )).limit(1);
  return session ? session.payloadJson as GiftPublicationPayload : null;
}

export async function completeGiftPublishSession(
  db: BackendDatabase,
  input: { sessionId: string; ownerEmail: string; now: string },
): Promise<{ albumId: string; oldObjectKeys: string[] } | null> {
  return db.transaction(async (tx) => {
    const [session] = await tx.select().from(giftPublishSessions).where(and(
      eq(giftPublishSessions.id, input.sessionId),
      eq(giftPublishSessions.ownerEmail, normalizeEmail(input.ownerEmail)),
      isNull(giftPublishSessions.completedAt),
      gt(giftPublishSessions.expiresAt, input.now),
    )).limit(1);
    if (!session) return null;

    const [owner] = await tx.select({ id: giftMembers.id }).from(giftMembers).where(and(
      eq(giftMembers.giftId, session.giftId),
      eq(giftMembers.email, normalizeEmail(input.ownerEmail)),
      eq(giftMembers.role, "owner"),
    )).limit(1);
    if (!owner) return null;

    const [current] = await tx.select().from(sharedAlbums).where(eq(sharedAlbums.giftId, session.giftId)).limit(1);
    const oldMedia = current
      ? await tx.select({ objectKey: sharedAlbumMedia.objectKey }).from(sharedAlbumMedia).where(eq(sharedAlbumMedia.sharedAlbumId, current.id))
      : [];
    const payload = session.payloadJson as GiftPublicationPayload;
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
      publishedAt: input.now,
      version,
    });
    if (payload.pages.length) await tx.insert(sharedAlbumPages).values(payload.pages.map((page) => ({
      id: crypto.randomUUID(), sharedAlbumId: albumId, position: page.position, pageJson: page.page,
    })));
    if (payload.media.length) await tx.insert(sharedAlbumMedia).values(payload.media.map((media) => ({
      id: crypto.randomUUID(), sharedAlbumId: albumId, ...media, createdAt: input.now,
    })));
    await tx.update(giftPublishSessions).set({ completedAt: input.now }).where(and(eq(giftPublishSessions.id, session.id), isNull(giftPublishSessions.completedAt)));
    return { albumId, oldObjectKeys: oldMedia.map((media) => media.objectKey) };
  });
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
  const result = await db.update(gifts).set({ status: "disabled", disabledAt }).where(and(eq(gifts.id, giftId), eq(gifts.status, "bound"))).returning({ id: gifts.id });
  if (!result.length) return false;
  await db.delete(giftMembers).where(eq(giftMembers.giftId, giftId));
  await db.delete(sharedAlbums).where(eq(sharedAlbums.giftId, giftId));
  return true;
}

export async function createInitializingGiftCard(
  db: BackendDatabase,
  input: { cardId: string; cardCode: string; giftId: string; tokenHash: string; note: string | null; adminEmail: string; createdAt: string; expiresAt: string },
) {
  const email = normalizeEmail(input.adminEmail);
  await db.transaction(async (tx) => {
    await tx.insert(gifts).values({ id: input.giftId, tokenHash: input.tokenHash, status: "initializing", createdAt: input.createdAt, claimedAt: null, disabledAt: null });
    await tx.insert(giftCards).values({ id: input.cardId, code: input.cardCode, state: "initializing", giftId: input.giftId, note: input.note, createdByEmail: email, expiresAt: input.expiresAt, activatedAt: null, retiredAt: null, createdAt: input.createdAt });
    await tx.insert(giftCardEvents).values({ id: crypto.randomUUID(), cardId: input.cardId, kind: "initialization_started", actorEmail: email, metadataJson: null, createdAt: input.createdAt });
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

export async function expireGiftCardReservations(db: BackendDatabase, now: string): Promise<number> {
  return db.transaction(async (tx) => {
    const cards = await tx.select().from(giftCards).where(and(eq(giftCards.state, "initializing"), lte(giftCards.expiresAt, now)));
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

export type GiftCardFilters = { state?: string; code?: string; note?: string };

export async function listGiftCards(db: BackendDatabase, filters: GiftCardFilters = {}) {
  const predicates = [];
  if (filters.state) predicates.push(eq(giftCards.state, filters.state));
  if (filters.code) predicates.push(ilike(giftCards.code, `%${filters.code}%`));
  if (filters.note) predicates.push(ilike(giftCards.note, `%${filters.note}%`));
  return db.select({ id: giftCards.id, code: giftCards.code, state: giftCards.state, note: giftCards.note, giftId: giftCards.giftId, giftStatus: gifts.status, createdAt: giftCards.createdAt, activatedAt: giftCards.activatedAt, retiredAt: giftCards.retiredAt })
    .from(giftCards)
    .leftJoin(gifts, eq(giftCards.giftId, gifts.id))
    .where(predicates.length ? and(...predicates) : undefined)
    .orderBy(giftCards.createdAt);
}

export async function getGiftCardDetails(db: BackendDatabase, cardId: string) {
  const [card] = await db.select({ id: giftCards.id, code: giftCards.code, state: giftCards.state, note: giftCards.note, giftId: giftCards.giftId, giftStatus: gifts.status, createdAt: giftCards.createdAt, expiresAt: giftCards.expiresAt, activatedAt: giftCards.activatedAt, retiredAt: giftCards.retiredAt })
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
