import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";
import { eq } from "drizzle-orm";
import { sharedAlbums, users } from "../src/server/db/schema";
import {
  activateGiftViewerByTokenHash, addGiftMember, claimGiftByTokenHash,
  completeGiftPublishSession, createGift, createGiftManagementRequest,
  createGiftPublishSession, decideGiftManagementRequest, disableGift, getSharedAlbumSnapshot,
  listGiftManagementRequestsForOwner, listGiftMediaCleanupJobs, listGiftMembers,
  listGiftManagementTargetsForEditor, removeGiftMember, updateGiftMemberRole,
} from "../src/server/gifts/repository";

async function fixture() {
  const testDb = createBackendTestDatabase();
  await migrateBackendDatabase(testDb.db);
  await testDb.db.insert(users).values([
    { id: "editor-user", email: "editor@example.com", createdAt: "2026-08-16T00:00:00.000Z", lastAuthenticatedAt: "2026-08-16T00:00:00.000Z" },
    { id: "viewer-user", email: "viewer@example.com", createdAt: "2026-08-16T00:00:00.000Z", lastAuthenticatedAt: "2026-08-16T00:00:00.000Z" },
  ]);
  await createGift(testDb.db, { id: "gift-1", tokenHash: "known", createdAt: "2026-08-16T00:00:00.000Z" });
  await claimGiftByTokenHash(testDb.db, "known", "owner@example.com", "2026-08-16T00:01:00.000Z");
  await addGiftMember(testDb.db, "gift-1", "editor@example.com", "2026-08-16T00:02:00.000Z", "editor");
  await addGiftMember(testDb.db, "gift-1", "viewer@example.com", "2026-08-16T00:02:00.000Z", "viewer");
  await activateGiftViewerByTokenHash(testDb.db, "known", { id: "editor-user", email: "editor@example.com" }, "2026-08-16T00:03:00.000Z");
  await activateGiftViewerByTokenHash(testDb.db, "known", { id: "viewer-user", email: "viewer@example.com" }, "2026-08-16T00:03:00.000Z");
  return testDb;
}

describe("gift management requests", () => {
  it("allows only an activated current editor and deduplicates equivalent pending requests", async () => {
    const { db, close } = await fixture();
    try {
      const first = await createGiftManagementRequest(db, { giftId: "gift-1", userId: "editor-user", email: "editor@example.com", action: "remove_member", targetEmail: "viewer@example.com", now: "2026-08-16T00:04:00.000Z" });
      expect(first.status).toBe("created");
      await expect(createGiftManagementRequest(db, { giftId: "gift-1", userId: "editor-user", email: "editor@example.com", action: "remove_member", targetEmail: "VIEWER@example.com", now: "2026-08-16T00:05:00.000Z" })).resolves.toEqual({ status: "duplicate" });
      await expect(createGiftManagementRequest(db, { giftId: "gift-1", userId: "viewer-user", email: "viewer@example.com", action: "delete_album", now: "2026-08-16T00:05:00.000Z" })).resolves.toEqual({ status: "forbidden" });
      await updateGiftMemberRole(db, "gift-1", "editor@example.com", "viewer");
      await expect(createGiftManagementRequest(db, { giftId: "gift-1", userId: "editor-user", email: "editor@example.com", action: "delete_album", now: "2026-08-16T00:06:00.000Z" })).resolves.toEqual({ status: "forbidden" });
    } finally { await close(); }
  });

  it("lists only non-owner, non-self management targets for an activated editor", async () => {
    const { db, close } = await fixture();
    try {
      await expect(listGiftManagementTargetsForEditor(db, { giftId: "gift-1", userId: "editor-user", email: "EDITOR@example.com" })).resolves.toEqual([
        { email: "viewer@example.com", role: "viewer" },
      ]);
      await expect(listGiftManagementTargetsForEditor(db, { giftId: "gift-1", userId: "viewer-user", email: "viewer@example.com" })).resolves.toBeNull();
      await removeGiftMember(db, "gift-1", "editor@example.com");
      await addGiftMember(db, "gift-1", "editor@example.com", "2026-08-16T00:04:00.000Z", "editor");
      await expect(listGiftManagementTargetsForEditor(db, { giftId: "gift-1", userId: "editor-user", email: "editor@example.com" })).resolves.toBeNull();
    } finally { await close(); }
  });

  it("does not list targets for a disabled gift", async () => {
    const { db, close } = await fixture();
    try {
      await disableGift(db, "gift-1", "2026-08-16T00:04:00.000Z");
      await expect(listGiftManagementTargetsForEditor(db, { giftId: "gift-1", userId: "editor-user", email: "editor@example.com" })).resolves.toBeNull();
    } finally { await close(); }
  });

  it("rejects invalid targets, owner targets, and self-directed role changes", async () => {
    const { db, close } = await fixture();
    try {
      await expect(createGiftManagementRequest(db, { giftId: "gift-1", userId: "editor-user", email: "editor@example.com", action: "remove_member", targetEmail: "owner@example.com", now: "2026-08-16T00:04:00.000Z" })).resolves.toEqual({ status: "invalid_target" });
      await expect(createGiftManagementRequest(db, { giftId: "gift-1", userId: "editor-user", email: "editor@example.com", action: "change_member_role", targetEmail: "editor@example.com", targetRole: "viewer", now: "2026-08-16T00:04:00.000Z" })).resolves.toEqual({ status: "invalid_target" });
      await expect(createGiftManagementRequest(db, { giftId: "gift-1", userId: "editor-user", email: "editor@example.com", action: "change_member_role", targetEmail: "missing@example.com", targetRole: "editor", now: "2026-08-16T00:04:00.000Z" })).resolves.toEqual({ status: "invalid_target" });
    } finally { await close(); }
  });

  it("rejects delete requests when no cloud album exists", async () => {
    const { db, close } = await fixture();
    try {
      await expect(createGiftManagementRequest(db, { giftId: "gift-1", userId: "editor-user", email: "editor@example.com", action: "delete_album", now: "2026-08-16T00:04:00.000Z" })).resolves.toEqual({ status: "invalid_target" });
    } finally { await close(); }
  });

  it("keeps a delete request pending when its album disappears before approval", async () => {
    const { db, close } = await fixture();
    try {
      await createGiftPublishSession(db, { id: "publish-stale", giftId: "gift-1", ownerEmail: "owner@example.com", baseVersion: 0, createdAt: "2026-08-16T00:03:00.000Z", expiresAt: "2026-08-16T00:13:00.000Z", payload: { sourceMemoryId: "local-memory", title: "Cloud", pages: [], media: [] } });
      await completeGiftPublishSession(db, { sessionId: "publish-stale", ownerEmail: "owner@example.com", now: "2026-08-16T00:03:30.000Z" });
      const created = await createGiftManagementRequest(db, { giftId: "gift-1", userId: "editor-user", email: "editor@example.com", action: "delete_album", now: "2026-08-16T00:04:00.000Z" });
      if (created.status !== "created") throw new Error("request not created");
      await db.delete(sharedAlbums).where(eq(sharedAlbums.giftId, "gift-1"));
      await expect(decideGiftManagementRequest(db, { giftId: "gift-1", requestId: created.request.id, ownerEmail: "owner@example.com", decision: "approved", now: "2026-08-16T00:05:00.000Z" })).resolves.toEqual({ status: "invalid_target" });
      await expect(listGiftManagementRequestsForOwner(db, "gift-1", "owner@example.com")).resolves.toEqual([expect.objectContaining({ id: created.request.id, status: "pending", decidedAt: null })]);
    } finally { await close(); }
  });

  it("serializes request creation with a competing editor downgrade", async () => {
    const { db, close } = await fixture();
    try {
      const [creation, downgraded] = await Promise.all([
        createGiftManagementRequest(db, { giftId: "gift-1", userId: "editor-user", email: "editor@example.com", action: "remove_member", targetEmail: "viewer@example.com", now: "2026-08-16T00:04:00.000Z" }),
        updateGiftMemberRole(db, "gift-1", "editor@example.com", "viewer"),
      ]);
      expect(downgraded).toBe(true);
      expect(["created", "forbidden"]).toContain(creation.status);
      if (creation.status === "created") {
        await expect(decideGiftManagementRequest(db, { giftId: "gift-1", requestId: creation.request.id, ownerEmail: "owner@example.com", decision: "approved", now: "2026-08-16T00:05:00.000Z" })).resolves.toEqual({ status: "requester_ineligible" });
      }
    } finally { await close(); }
  });

  it("serializes approval eligibility with a competing requester removal", async () => {
    const { db, close } = await fixture();
    try {
      const created = await createGiftManagementRequest(db, { giftId: "gift-1", userId: "editor-user", email: "editor@example.com", action: "change_member_role", targetEmail: "viewer@example.com", targetRole: "editor", now: "2026-08-16T00:04:00.000Z" });
      if (created.status !== "created") throw new Error("request not created");
      const [decision, removed] = await Promise.all([
        decideGiftManagementRequest(db, { giftId: "gift-1", requestId: created.request.id, ownerEmail: "owner@example.com", decision: "approved", now: "2026-08-16T00:05:00.000Z" }),
        removeGiftMember(db, "gift-1", "editor@example.com"),
      ]);
      expect(removed).toBe(true);
      expect(["approved", "requester_ineligible", "not_pending"]).toContain(decision.status);
      if (decision.status !== "approved") {
        await expect(listGiftMembers(db, "gift-1")).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ email: "viewer@example.com", role: "viewer" })]));
      }
    } finally { await close(); }
  });

  it("lets only the owner list and decide, then rejects a repeated decision", async () => {
    const { db, close } = await fixture();
    try {
      const created = await createGiftManagementRequest(db, { giftId: "gift-1", userId: "editor-user", email: "editor@example.com", action: "change_member_role", targetEmail: "viewer@example.com", targetRole: "editor", now: "2026-08-16T00:04:00.000Z" });
      if (created.status !== "created") throw new Error("request not created");
      await expect(listGiftManagementRequestsForOwner(db, "gift-1", "editor@example.com")).resolves.toBeNull();
      await expect(listGiftManagementRequestsForOwner(db, "gift-1", "owner@example.com")).resolves.toEqual([expect.objectContaining({ id: created.request.id, action: "change_member_role", targetEmail: "viewer@example.com" })]);
      await expect(decideGiftManagementRequest(db, { giftId: "gift-1", requestId: created.request.id, ownerEmail: "editor@example.com", decision: "approved", now: "2026-08-16T00:05:00.000Z" })).resolves.toEqual({ status: "forbidden" });
      await expect(decideGiftManagementRequest(db, { giftId: "gift-1", requestId: created.request.id, ownerEmail: "owner@example.com", decision: "approved", now: "2026-08-16T00:05:00.000Z" })).resolves.toEqual({ status: "approved" });
      await expect(listGiftMembers(db, "gift-1")).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ email: "viewer@example.com", role: "editor" })]));
      await expect(decideGiftManagementRequest(db, { giftId: "gift-1", requestId: created.request.id, ownerEmail: "owner@example.com", decision: "rejected", now: "2026-08-16T00:06:00.000Z" })).resolves.toEqual({ status: "not_pending" });
    } finally { await close(); }
  });

  it("revalidates requester eligibility and safely deletes only the cloud snapshot", async () => {
    const { db, close } = await fixture();
    try {
      await createGiftPublishSession(db, { id: "publish", giftId: "gift-1", ownerEmail: "owner@example.com", baseVersion: 0, createdAt: "2026-08-16T00:03:00.000Z", expiresAt: "2026-08-16T00:13:00.000Z", payload: { sourceMemoryId: "local-memory", title: "Cloud", pages: [], media: [{ position: 0, objectKey: "gifts/gift-1/photo.jpg", contentType: "image/jpeg", byteSize: 10 }], cover: { objectKey: "gifts/gift-1/cover.jpg", contentType: "image/jpeg", byteSize: 5 } } });
      const album = await completeGiftPublishSession(db, { sessionId: "publish", ownerEmail: "owner@example.com", now: "2026-08-16T00:03:30.000Z" });
      const created = await createGiftManagementRequest(db, { giftId: "gift-1", userId: "editor-user", email: "editor@example.com", action: "delete_album", now: "2026-08-16T00:04:00.000Z" });
      if (created.status !== "created") throw new Error("request not created");
      await updateGiftMemberRole(db, "gift-1", "editor@example.com", "viewer");
      await expect(decideGiftManagementRequest(db, { giftId: "gift-1", requestId: created.request.id, ownerEmail: "owner@example.com", decision: "approved", now: "2026-08-16T00:05:00.000Z" })).resolves.toEqual({ status: "requester_ineligible" });
      await updateGiftMemberRole(db, "gift-1", "editor@example.com", "editor");
      await expect(decideGiftManagementRequest(db, { giftId: "gift-1", requestId: created.request.id, ownerEmail: "owner@example.com", decision: "approved", now: "2026-08-16T00:06:00.000Z" })).resolves.toEqual({ status: "approved" });
      await expect(getSharedAlbumSnapshot(db, album!.albumId)).resolves.toBeNull();
      await expect(listGiftMediaCleanupJobs(db, "2026-08-16T00:06:00.000Z")).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ objectKey: "gifts/gift-1/photo.jpg" }), expect.objectContaining({ objectKey: "gifts/gift-1/cover.jpg" }),
      ]));
    } finally { await close(); }
  });
});

describe("gift management request routes", () => {
  afterEach(() => { jest.restoreAllMocks(); delete process.env.GIFT_SHARING_ENABLED; jest.resetModules(); });

  it("rejects malformed editor actions before repository creation", async () => {
    process.env.GIFT_SHARING_ENABLED = "true";
    const dbClient = require("../src/server/db/client") as typeof import("../src/server/db/client");
    const auth = require("../src/server/auth/session-auth") as typeof import("../src/server/auth/session-auth");
    const repository = require("../src/server/gifts/repository") as typeof import("../src/server/gifts/repository");
    jest.spyOn(dbClient, "getServerDatabase").mockReturnValue({} as never);
    jest.spyOn(auth, "requireAuthenticatedAccount").mockResolvedValue({ id: "editor-user", email: "editor@example.com", isAdmin: false } as never);
    const create = jest.spyOn(repository, "createGiftManagementRequest");
    const { POST } = require("../src/app/api/gifts/invited/[id]/management-requests+api") as typeof import("../src/app/api/gifts/invited/[id]/management-requests+api");
    const response = await POST(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "take_ownership" }) }), { id: "gift-1" });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "validation_failed" }) }));
    expect(create).not.toHaveBeenCalled();
  });

  it("honours the sharing kill switch before authenticating an editor", async () => {
    process.env.GIFT_SHARING_ENABLED = "false";
    const auth = require("../src/server/auth/session-auth") as typeof import("../src/server/auth/session-auth");
    const authenticate = jest.spyOn(auth, "requireAuthenticatedAccount");
    const { POST } = require("../src/app/api/gifts/invited/[id]/management-requests+api") as typeof import("../src/app/api/gifts/invited/[id]/management-requests+api");
    const response = await POST(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_album" }) }), { id: "gift-1" });
    expect(response.status).toBe(503);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("rejects management-target GET while sharing is disabled", async () => {
    process.env.GIFT_SHARING_ENABLED = "false";
    const auth = require("../src/server/auth/session-auth") as typeof import("../src/server/auth/session-auth");
    const authenticate = jest.spyOn(auth, "requireAuthenticatedAccount");
    const { GET } = require("../src/app/api/gifts/invited/[id]/management-requests+api") as typeof import("../src/app/api/gifts/invited/[id]/management-requests+api");
    const response = await GET(new Request("http://localhost"), { id: "gift-1" });
    expect(response.status).toBe(503);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("returns only the repository target projection and rejects ineligible accounts", async () => {
    process.env.GIFT_SHARING_ENABLED = "true";
    const dbClient = require("../src/server/db/client") as typeof import("../src/server/db/client");
    const auth = require("../src/server/auth/session-auth") as typeof import("../src/server/auth/session-auth");
    const repository = require("../src/server/gifts/repository") as typeof import("../src/server/gifts/repository");
    jest.spyOn(dbClient, "getServerDatabase").mockReturnValue({} as never);
    jest.spyOn(auth, "requireAuthenticatedAccount").mockResolvedValue({ id: "editor-user", email: "editor@example.com", isAdmin: false } as never);
    const targets = jest.spyOn(repository, "listGiftManagementTargetsForEditor").mockResolvedValue([{ email: "viewer@example.com", role: "viewer" }]);
    const { GET } = require("../src/app/api/gifts/invited/[id]/management-requests+api") as typeof import("../src/app/api/gifts/invited/[id]/management-requests+api");
    const response = await GET(new Request("http://localhost"), { id: "gift-1" });
    await expect(response.json()).resolves.toEqual({ members: [{ email: "viewer@example.com", role: "viewer" }] });
    expect(targets).toHaveBeenCalledWith(expect.anything(), { giftId: "gift-1", userId: "editor-user", email: "editor@example.com" });
    targets.mockResolvedValueOnce(null);
    expect((await GET(new Request("http://localhost"), { id: "gift-1" })).status).toBe(403);
  });

  it("requires owner access before listing or deciding", async () => {
    const ownerAccess = require("../src/server/gifts/owner-access") as typeof import("../src/server/gifts/owner-access");
    const { ApiError } = require("../src/server/http/errors") as typeof import("../src/server/http/errors");
    jest.spyOn(ownerAccess, "requireOwnedGift").mockRejectedValue(new ApiError(403, "gift_owner_required", "owner only"));
    const route = require("../src/app/api/my-gifts/[id]/management-requests+api") as typeof import("../src/app/api/my-gifts/[id]/management-requests+api");
    const request = new Request("http://localhost");
    expect((await route.GET(request, { id: "gift-1" })).status).toBe(403);
    expect((await route.PATCH(new Request("http://localhost", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: "request-1", decision: "approved" }) }), { id: "gift-1" })).status).toBe(403);
  });
});
