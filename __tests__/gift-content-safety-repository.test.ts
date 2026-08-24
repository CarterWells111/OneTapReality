import { and, eq, or } from "drizzle-orm";

import { createOrGetUserByEmail } from "../src/server/auth/repository";
import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";
import {
  giftContentReports,
  giftMembers,
  sharedAlbums,
  userBlocks,
  users,
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
  createGiftManagementRequest,
  getActivatedGiftAccessByGiftId,
  getGiftAccessByTokenHash,
  GiftRelationshipBlockedError,
  listInvitedGifts,
  listGiftManagementTargetsForEditor,
  removeGiftMember,
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

  it("rejects an owner report instead of creating a self-report that cannot be hidden", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const { owner } = await createSharedFixture(db, {
        giftId: "gift-owner-report",
        tokenHash: "token-owner-report",
        ownerEmail: "owner@example.com",
        memberEmail: "viewer@example.com",
      });

      await expect(reportGiftContent(db, {
        giftId: "gift-owner-report",
        reporterUserId: owner.id,
        reporterEmail: owner.email,
        reason: "other",
        now,
      })).resolves.toEqual({ status: "owner_forbidden" });
      await expect(db.select().from(giftContentReports)).resolves.toEqual([]);
    } finally { await close(); }
  });

  it("hides a reported gift from NFC token access and prevents token reactivation", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const { member } = await createSharedFixture(db, {
        giftId: "gift-token-report",
        tokenHash: "token-report-hidden",
        ownerEmail: "owner@example.com",
        memberEmail: "viewer@example.com",
      });
      await reportGiftContent(db, {
        giftId: "gift-token-report", reporterUserId: member.id, reporterEmail: member.email,
        reason: "spam", now,
      });

      await expect(getGiftAccessByTokenHash(db, "token-report-hidden", member.email)).resolves.toBeNull();
      await expect(activateGiftViewerByTokenHash(db, "token-report-hidden", member, "2026-08-24T12:01:00.000Z")).resolves.toBeNull();
    } finally { await close(); }
  });

  it("prevents a reported editor from listing targets or creating management requests", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const { member } = await createSharedFixture(db, {
        giftId: "gift-editor-report",
        tokenHash: "token-editor-report",
        ownerEmail: "owner@example.com",
        memberEmail: "editor@example.com",
        role: "editor",
      });
      await reportGiftContent(db, {
        giftId: "gift-editor-report", reporterUserId: member.id, reporterEmail: member.email,
        reason: "harassment", now,
      });

      await expect(listGiftManagementTargetsForEditor(db, {
        giftId: "gift-editor-report", userId: member.id, email: member.email,
      })).resolves.toBeNull();
      await expect(createGiftManagementRequest(db, {
        giftId: "gift-editor-report", userId: member.id, email: member.email,
        action: "delete_album", now: "2026-08-24T12:01:00.000Z",
      })).resolves.toEqual({ status: "forbidden" });
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

  it("locks both active account identities before the gift and rejects a pending deletion target", async () => {
    const queries: string[] = [];
    const { db, close } = createBackendTestDatabase({ onQuery: (query) => queries.push(query) });
    try {
      await migrateBackendDatabase(db);
      const { owner, member } = await createSharedFixture(db, {
        giftId: "gift-deleting-target",
        tokenHash: "token-deleting-target",
        ownerEmail: "owner@example.com",
        memberEmail: "viewer@example.com",
      });
      await db.update(users).set({
        deletionState: "pending",
        deletionRequestedAt: "2026-08-24T12:01:00.000Z",
      }).where(eq(users.id, owner.id));
      queries.length = 0;

      await expect(blockGiftUser(db, {
        giftId: "gift-deleting-target",
        actorUserId: member.id,
        actorEmail: member.email,
        targetEmail: owner.email,
        now: "2026-08-24T12:02:00.000Z",
      })).resolves.toEqual({ status: "invalid_target" });
      expect(await db.select().from(userBlocks)).toEqual([]);

      const executed = queries.join("\n");
      expect(executed).toMatch(/from "users"[\s\S]*order by "users"\."id"[\s\S]*for update/iu);
      expect(executed.indexOf('from "users"')).toBeLessThan(executed.indexOf('update "gifts"'));
    } finally { await close(); }
  });

  it("still lets an active owner block an unregistered historical member", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const owner = await createOrGetUserByEmail(db, "owner@example.com", now);
      await createGift(db, { id: "gift-unregistered-history", tokenHash: "token-unregistered-history", createdAt: now });
      await claimGiftByTokenHash(db, "token-unregistered-history", owner.email, now);
      await addGiftMember(db, "gift-unregistered-history", "former@example.com", now);
      await expect(removeGiftMember(db, "gift-unregistered-history", "former@example.com")).resolves.toBe(true);

      await expect(blockGiftUser(db, {
        giftId: "gift-unregistered-history",
        actorUserId: owner.id,
        actorEmail: owner.email,
        targetEmail: "former@example.com",
        now: "2026-08-24T12:01:00.000Z",
      })).resolves.toEqual(expect.objectContaining({ status: "created" }));
      await expect(db.select().from(userBlocks)).resolves.toEqual([
        expect.objectContaining({ blockerUserId: owner.id, blockedUserId: null, blockedEmail: "former@example.com" }),
      ]);
    } finally { await close(); }
  });

  it("rejects an actor whose deletion became pending after request authentication", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const { owner, member } = await createSharedFixture(db, {
        giftId: "gift-deleting-actor",
        tokenHash: "token-deleting-actor",
        ownerEmail: "owner@example.com",
        memberEmail: "viewer@example.com",
      });
      await db.update(users).set({
        deletionState: "pending",
        deletionRequestedAt: "2026-08-24T12:01:00.000Z",
      }).where(eq(users.id, member.id));

      await expect(blockGiftUser(db, {
        giftId: "gift-deleting-actor",
        actorUserId: member.id,
        actorEmail: member.email,
        targetEmail: owner.email,
        now: "2026-08-24T12:02:00.000Z",
      })).resolves.toEqual({ status: "forbidden" });
      await expect(db.select().from(userBlocks)).resolves.toEqual([]);
    } finally { await close(); }
  });

  it("lets an invited member leave, then block the historical owner relationship", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const { owner, member } = await createSharedFixture(db, {
        giftId: "gift-leave-block",
        tokenHash: "token-leave-block",
        ownerEmail: "owner@example.com",
        memberEmail: "viewer@example.com",
      });
      await expect(leaveGiftMembership(db, {
        giftId: "gift-leave-block", userId: member.id, email: member.email,
      })).resolves.toEqual({ status: "left" });

      await expect(blockGiftUser(db, {
        giftId: "gift-leave-block", actorUserId: member.id, actorEmail: member.email,
        targetEmail: owner.email, now: "2026-08-24T12:01:00.000Z",
      })).resolves.toEqual(expect.objectContaining({ status: "created" }));
      await expect(addGiftMember(db, "gift-leave-block", member.email, "2026-08-24T12:02:00.000Z"))
        .rejects.toBeInstanceOf(GiftRelationshipBlockedError);
    } finally { await close(); }
  });

  it("lets an owner block a previously removed member and prevents reinvitation", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const { owner, member } = await createSharedFixture(db, {
        giftId: "gift-remove-block",
        tokenHash: "token-remove-block",
        ownerEmail: "owner@example.com",
        memberEmail: "viewer@example.com",
      });
      await expect(removeGiftMember(db, "gift-remove-block", member.email)).resolves.toBe(true);

      await expect(blockGiftUser(db, {
        giftId: "gift-remove-block", actorUserId: owner.id, actorEmail: owner.email,
        targetEmail: member.email, now: "2026-08-24T12:01:00.000Z",
      })).resolves.toEqual(expect.objectContaining({ status: "created" }));
      await expect(addGiftMember(db, "gift-remove-block", member.email, "2026-08-24T12:02:00.000Z"))
        .rejects.toBeInstanceOf(GiftRelationshipBlockedError);
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
