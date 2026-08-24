import { and, eq, or } from "drizzle-orm";

import { createOrGetUserByEmail } from "../src/server/auth/repository";
import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";
import {
  giftContentReports,
  giftMembers,
  sharedAlbums,
  userBlocks,
} from "../src/server/db/schema";
import {
  blockGiftUser,
  GIFT_CONTENT_REPORT_REASONS,
  leaveGiftMembership,
  processPendingGiftContentReportNotifications,
  recordGiftContentReportDisposition,
  reportGiftContent,
} from "../src/server/gifts/content-safety";
import {
  activateGiftViewerByTokenHash,
  addGiftMember,
  claimGiftByTokenHash,
  createGift,
  getActivatedGiftAccessByGiftId,
  GiftRelationshipBlockedError,
  listInvitedGifts,
  updateGiftMemberRole,
} from "../src/server/gifts/repository";

const now = "2026-08-24T12:00:00.000Z";

async function createSharedFixture(
  db: ReturnType<typeof createBackendTestDatabase>["db"],
  input: { giftId: string; tokenHash: string; ownerEmail: string; memberEmail: string; role?: "viewer" | "editor"; version?: number },
) {
  const owner = await createOrGetUserByEmail(db, input.ownerEmail, now);
  const member = await createOrGetUserByEmail(db, input.memberEmail, now);
  await createGift(db, { id: input.giftId, tokenHash: input.tokenHash, createdAt: now });
  await claimGiftByTokenHash(db, input.tokenHash, owner.email, now);
  await addGiftMember(db, input.giftId, member.email, now, input.role ?? "viewer");
  await activateGiftViewerByTokenHash(db, input.tokenHash, member, now);
  await db.insert(sharedAlbums).values({
    id: `${input.giftId}-album`,
    giftId: input.giftId,
    sourceMemoryId: `${input.giftId}-memory`,
    title: "审核共享相册",
    travelDate: "2026-08-01",
    publishedAt: now,
    version: input.version ?? 7,
    coverObjectKey: null,
    coverContentType: null,
    coverByteSize: null,
  });
  return { owner, member };
}

describe("gift content safety repository", () => {
  it("defines exactly the six externally documented report reasons", () => {
    expect(GIFT_CONTENT_REPORT_REASONS).toEqual([
      "sexual",
      "harassment",
      "hate",
      "violence",
      "spam",
      "other",
    ]);
  });

  it("captures the current snapshot and idempotently hides it from the reporter", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const { member } = await createSharedFixture(db, {
        giftId: "gift-report",
        tokenHash: "token-report",
        ownerEmail: "owner@example.com",
        memberEmail: "reporter@example.com",
        version: 7,
      });

      const first = await reportGiftContent(db, {
        giftId: "gift-report",
        reporterUserId: member.id,
        reporterEmail: member.email,
        reason: "harassment",
        details: "令人不适的文字",
        now,
      });
      const duplicate = await reportGiftContent(db, {
        giftId: "gift-report",
        reporterUserId: member.id,
        reporterEmail: member.email,
        reason: "harassment",
        details: "客户端重试不应新建记录",
        now: "2026-08-24T12:01:00.000Z",
      });

      expect(first.status).toBe("created");
      if (first.status !== "created" || duplicate.status !== "existing") throw new Error("Expected idempotent report results");
      expect(duplicate).toEqual(expect.objectContaining({ status: "existing", report: expect.objectContaining({ id: first.report.id }) }));
      expect(first.report).toEqual(expect.objectContaining({ reason: "harassment", snapshotVersion: 7 }));
      const rows = await db.select().from(giftContentReports);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual(expect.objectContaining({
        giftId: "gift-report",
        reporterUserId: member.id,
        snapshotVersion: 7,
        details: "令人不适的文字",
      }));
      expect(await listInvitedGifts(db, member.id, member.email)).toEqual([]);
      expect(await getActivatedGiftAccessByGiftId(db, "gift-report", member.id, member.email)).toBeNull();
    } finally { await close(); }
  });

  it("durably retries a failed sanitized support notice and records its disposition", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const { member } = await createSharedFixture(db, {
        giftId: "gift-report-retry",
        tokenHash: "token-report-retry",
        ownerEmail: "owner@example.com",
        memberEmail: "reporter@example.com",
        version: 8,
      });
      const created = await reportGiftContent(db, {
        giftId: "gift-report-retry",
        reporterUserId: member.id,
        reporterEmail: member.email,
        reason: "violence",
        details: "sensitive reporter text",
        now,
      });
      if (created.status !== "created") throw new Error("Expected a new report");
      const sendNotice = jest.fn()
        .mockRejectedValueOnce(new Error("provider failed with reporter@example.com"))
        .mockResolvedValueOnce(undefined);

      await expect(processPendingGiftContentReportNotifications(db, {
        now: "2026-08-24T12:01:00.000Z", limit: 10, sendNotice,
      })).resolves.toEqual({ attempted: 1, notified: 0, failed: 1 });
      let [report] = await db.select().from(giftContentReports).where(eq(giftContentReports.id, created.report.id));
      expect(report.supportNotifiedAt).toBeNull();

      await expect(processPendingGiftContentReportNotifications(db, {
        now: "2026-08-24T12:02:00.000Z", limit: 10, sendNotice,
      })).resolves.toEqual({ attempted: 1, notified: 1, failed: 0 });
      expect(sendNotice).toHaveBeenLastCalledWith({
        reportId: created.report.id,
        giftId: "gift-report-retry",
        snapshotVersion: 8,
        reason: "violence",
      });
      expect(JSON.stringify(sendNotice.mock.calls)).not.toMatch(/reporter@example\.com|sensitive reporter text/u);

      expect(await recordGiftContentReportDisposition(db, {
        reportId: created.report.id,
        state: "resolved",
        disposition: "content_disabled",
        note: "已永久停用礼品",
        disposedAt: "2026-08-24T12:03:00.000Z",
      })).toBe(true);
      [report] = await db.select().from(giftContentReports).where(eq(giftContentReports.id, created.report.id));
      expect(report).toEqual(expect.objectContaining({
        supportNotifiedAt: "2026-08-24T12:02:00.000Z",
        state: "resolved",
        disposition: "content_disabled",
        dispositionNote: "已永久停用礼品",
        disposedAt: "2026-08-24T12:03:00.000Z",
      }));
      await expect(processPendingGiftContentReportNotifications(db, {
        now: "2026-08-24T12:04:00.000Z", limit: 10, sendNotice,
      })).resolves.toEqual({ attempted: 0, notified: 0, failed: 0 });
    } finally { await close(); }
  });

  it("creates one bidirectional block, removes invited access and prevents reinvites in both directions", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const { owner, member } = await createSharedFixture(db, {
        giftId: "gift-block",
        tokenHash: "token-block",
        ownerEmail: "owner@example.com",
        memberEmail: "viewer@example.com",
      });

      const first = await blockGiftUser(db, {
        giftId: "gift-block",
        actorUserId: member.id,
        actorEmail: member.email,
        targetEmail: owner.email,
        now,
      });
      const duplicate = await blockGiftUser(db, {
        giftId: "gift-block",
        actorUserId: member.id,
        actorEmail: member.email,
        targetEmail: owner.email,
        now: "2026-08-24T12:01:00.000Z",
      });

      expect(first.status).toBe("created");
      if (first.status !== "created" || duplicate.status !== "existing") throw new Error("Expected idempotent block results");
      expect(duplicate).toEqual(expect.objectContaining({ status: "existing", block: expect.objectContaining({ id: first.block.id }) }));
      expect(await db.select().from(userBlocks)).toHaveLength(1);
      expect(await db.select().from(giftMembers).where(and(eq(giftMembers.giftId, "gift-block"), eq(giftMembers.email, member.email)))).toEqual([]);
      expect(await db.select().from(giftMembers).where(and(eq(giftMembers.giftId, "gift-block"), eq(giftMembers.email, owner.email)))).toHaveLength(1);

      await expect(addGiftMember(db, "gift-block", member.email, now)).rejects.toBeInstanceOf(GiftRelationshipBlockedError);
      await db.insert(giftMembers).values({
        id: "forced-blocked-role", giftId: "gift-block", email: member.email, role: "viewer", createdAt: now,
      });
      await expect(updateGiftMemberRole(db, "gift-block", member.email, "editor"))
        .rejects.toBeInstanceOf(GiftRelationshipBlockedError);
      await db.delete(giftMembers).where(eq(giftMembers.id, "forced-blocked-role"));

      await createGift(db, { id: "gift-reverse", tokenHash: "token-reverse", createdAt: now });
      await claimGiftByTokenHash(db, "token-reverse", member.email, now);
      await expect(addGiftMember(db, "gift-reverse", owner.email, now)).rejects.toBeInstanceOf(GiftRelationshipBlockedError);
    } finally { await close(); }
  });

  it("rejects self or unrelated blocks and blocks token activation/claim paths defensively", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const { owner, member } = await createSharedFixture(db, {
        giftId: "gift-source",
        tokenHash: "token-source",
        ownerEmail: "owner@example.com",
        memberEmail: "viewer@example.com",
      });
      expect(await blockGiftUser(db, {
        giftId: "gift-source",
        actorUserId: member.id,
        actorEmail: member.email,
        targetEmail: member.email,
        now,
      })).toEqual({ status: "invalid_target" });
      expect(await blockGiftUser(db, {
        giftId: "gift-source",
        actorUserId: member.id,
        actorEmail: member.email,
        targetEmail: "stranger@example.com",
        now,
      })).toEqual({ status: "invalid_target" });

      await blockGiftUser(db, {
        giftId: "gift-source",
        actorUserId: member.id,
        actorEmail: member.email,
        targetEmail: owner.email,
        now,
      });
      await createGift(db, { id: "gift-activation", tokenHash: "token-activation", createdAt: now });
      await claimGiftByTokenHash(db, "token-activation", owner.email, now);
      await db.insert(giftMembers).values({ id: "forced-invite", giftId: "gift-activation", email: member.email, role: "viewer", createdAt: now });
      await expect(activateGiftViewerByTokenHash(db, "token-activation", member, now)).rejects.toBeInstanceOf(GiftRelationshipBlockedError);

      await createGift(db, { id: "gift-claim", tokenHash: "token-claim", createdAt: now });
      await db.insert(giftMembers).values({ id: "forced-prior-member", giftId: "gift-claim", email: owner.email, role: "viewer", createdAt: now });
      await expect(claimGiftByTokenHash(db, "token-claim", member.email, now)).rejects.toBeInstanceOf(GiftRelationshipBlockedError);
    } finally { await close(); }
  });

  it("lets activated viewers and editors leave but never removes an owner", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const viewerFixture = await createSharedFixture(db, {
        giftId: "gift-leave-viewer",
        tokenHash: "token-leave-viewer",
        ownerEmail: "owner-viewer@example.com",
        memberEmail: "viewer@example.com",
      });
      const editorFixture = await createSharedFixture(db, {
        giftId: "gift-leave-editor",
        tokenHash: "token-leave-editor",
        ownerEmail: "owner-editor@example.com",
        memberEmail: "editor@example.com",
        role: "editor",
      });

      expect(await leaveGiftMembership(db, {
        giftId: "gift-leave-viewer",
        userId: viewerFixture.member.id,
        email: viewerFixture.member.email,
      })).toEqual({ status: "left" });
      expect(await leaveGiftMembership(db, {
        giftId: "gift-leave-editor",
        userId: editorFixture.member.id,
        email: editorFixture.member.email,
      })).toEqual({ status: "left" });
      expect(await leaveGiftMembership(db, {
        giftId: "gift-leave-viewer",
        userId: viewerFixture.owner.id,
        email: viewerFixture.owner.email,
      })).toEqual({ status: "owner_forbidden" });
      expect(await db.select().from(giftMembers).where(or(
        eq(giftMembers.email, viewerFixture.member.email),
        eq(giftMembers.email, editorFixture.member.email),
      ))).toEqual([]);
    } finally { await close(); }
  });
});
