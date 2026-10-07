import { and, eq } from "drizzle-orm";

import { DELETE as deleteAccount } from "../src/app/api/account+api";
import { POST as requestDeletionChallenge } from "../src/app/api/account/deletion-challenge+api";
import { POST as logout } from "../src/app/api/auth/logout+api";
import { GET as readOwnedAlbum } from "../src/app/api/my-gifts/[id]/album+api";
import { POST as ownerPOST, PUT as ownerPUT, PATCH as ownerPATCH } from "../src/app/api/my-gifts/[id]/publish+api";
import { POST as disableOwnedGift } from "../src/app/api/my-gifts/[id]/disable+api";
import { POST as editorPOST, PUT as editorPUT, PATCH as editorPATCH } from "../src/app/api/gifts/invited/[id]/publish+api";
import { GET as managementGET, POST as managementPOST } from "../src/app/api/gifts/invited/[id]/management-requests+api";
import { POST as retireAdminCard } from "../src/app/api/admin/gift-cards/[id]/retire+api";
import { hashAccessToken } from "../src/server/auth/device-auth";
import { createAuthSession, createOrGetUserByEmail, getAuthenticatedUserByTokenHash } from "../src/server/auth/repository";
import { requireAuthenticatedAccountSession } from "../src/server/auth/session-auth";
import { accountDeletionJobs, giftManagementRequests, giftMembers, giftPublishSessions, sharedAlbums, users } from "../src/server/db/schema";
import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";
import { activateGiftCard, addGiftMember, claimGiftByTokenHash, createGift, createGiftPublishSession, createInitializingGiftCard } from "../src/server/gifts/repository";

let mockCurrentDb: ReturnType<typeof createBackendTestDatabase>["db"];
const mockMedia = {
  createReadUrl: jest.fn(async () => "https://local.invalid/read"), createUploadUrl: jest.fn(async () => "https://local.invalid/upload"),
  getObjectMetadata: jest.fn(), copyObject: jest.fn(), deleteObjects: jest.fn(),
};
const mockSendDeletionCode = jest.fn(async (_input: { code: string }) => undefined);
jest.mock("../src/server/db/client", () => ({ ...jest.requireActual("../src/server/db/client"), getServerDatabase: () => mockCurrentDb }));
jest.mock("../src/server/gifts/r2-media", () => ({ getR2MediaStoreFromEnvironment: () => mockMedia }));
jest.mock("../src/server/gifts/resend-email-sender", () => ({ sendAccountDeletionVerificationEmail: (input: { code: string }) => mockSendDeletionCode(input) }));
jest.mock("../src/server/maintenance/opportunistic-gift-maintenance", () => ({ scheduleOpportunisticGiftMaintenance: jest.fn() }));

const ownerEmail = "owner@example.test", editorEmail = "editor@example.test", viewerEmail = "viewer@example.test", adminEmail = "admin@example.test";
const syntheticPepper = "local-regression-pepper";
const giftId = "local-gift", ownerToken = "local-owner-token", editorToken = "local-editor-token";
const publishBody = { baseVersion: 1, sourceMemoryId: "memory", title: "Trip", pages: [], media: [] };

describe("P1 current-main old-session revocation and deletion compatibility", () => {
  let close: () => Promise<void>;
  const environmentKeys = ["GIFT_AUTH_PEPPER", "ALPHA_ALLOWED_EMAILS", "GIFT_SHARING_ENABLED", "GIFT_ADMIN_EMAILS", "RESEND_API_KEY", "GIFT_EMAIL_FROM"];
  const originalEnvironment = Object.fromEntries(environmentKeys.map(name => [name, process.env[name]]));

  function request(actor: "owner" | "editor", method: string, body?: unknown) {
    return new Request("https://local.test/api/gifts", {
      method, headers: { Authorization: `Bearer ${actor === "owner" ? ownerToken : editorToken}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, "info").mockImplementation(() => undefined);
    const database = createBackendTestDatabase();
    mockCurrentDb = database.db; close = database.close;
    await migrateBackendDatabase(mockCurrentDb);
    process.env.GIFT_AUTH_PEPPER = syntheticPepper;
    process.env.ALPHA_ALLOWED_EMAILS = [ownerEmail, editorEmail, viewerEmail, adminEmail].join(",");
    process.env.GIFT_SHARING_ENABLED = "true";
    process.env.GIFT_ADMIN_EMAILS = adminEmail;
    const now = new Date().toISOString(), expiresAt = new Date(Date.now() + 600_000).toISOString();
    const owner = await createOrGetUserByEmail(mockCurrentDb, ownerEmail, now);
    const editor = await createOrGetUserByEmail(mockCurrentDb, editorEmail, now);
    for (const [user, token, sessionId] of [[owner, ownerToken, "owner-session"], [editor, editorToken, "editor-session"]] as const) {
      await createAuthSession(mockCurrentDb, { id: sessionId, userId: user.id, tokenHash: await hashAccessToken(token, syntheticPepper), createdAt: now, expiresAt });
    }
    await createGift(mockCurrentDb, { id: giftId, tokenHash: "local-gift-hash", createdAt: now });
    await claimGiftByTokenHash(mockCurrentDb, "local-gift-hash", ownerEmail, now);
    await addGiftMember(mockCurrentDb, giftId, editorEmail, now, "editor");
    await addGiftMember(mockCurrentDb, giftId, viewerEmail, now, "viewer");
    await mockCurrentDb.insert(sharedAlbums).values({ id: "local-album", giftId, sourceMemoryId: "memory", title: "Trip", version: 1, publishedAt: now });
    const [editorMember] = await mockCurrentDb.select().from(giftMembers).where(and(eq(giftMembers.giftId, giftId), eq(giftMembers.email, editorEmail)));
    for (const [id, email, memberId, actorUserId] of [["owner-publication", ownerEmail, null, null], ["editor-publication", editorEmail, editorMember.id, editor.id]] as const) {
      await createGiftPublishSession(mockCurrentDb, { id, giftId, ownerEmail: email, memberId, actorUserId, baseVersion: 1, createdAt: now, expiresAt,
        payload: { sourceMemoryId: "memory", title: "Trip", pages: [], media: [] } });
    }
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    await close();
  });

  const routes = [
    ["owner read", "owner", () => readOwnedAlbum(request("owner", "GET"), { id: giftId }), 200],
    ["owner POST", "owner", () => ownerPOST(request("owner", "POST", publishBody), { id: giftId }), 201],
    ["owner PUT", "owner", () => ownerPUT(request("owner", "PUT", { publicationId: "owner-publication" }), { id: giftId }), 201],
    ["owner PATCH", "owner", () => ownerPATCH(request("owner", "PATCH", { publicationId: "owner-publication", positions: [] }), { id: giftId }), 200],
    ["editor POST", "editor", () => editorPOST(request("editor", "POST", publishBody), { id: giftId }), 201],
    ["editor PUT", "editor", () => editorPUT(request("editor", "PUT", { publicationId: "editor-publication" }), { id: giftId }), 201],
    ["editor PATCH", "editor", () => editorPATCH(request("editor", "PATCH", { publicationId: "editor-publication", positions: [] }), { id: giftId }), 200],
    ["management GET", "editor", () => managementGET(request("editor", "GET"), { id: giftId }), 200],
    ["management POST", "editor", () => managementPOST(request("editor", "POST", { action: "delete_album" }), { id: giftId }), 201],
  ] as const;

  it.each(routes)("rejects %s after removing the %s from Alpha", async (_name, actor, invoke) => {
    process.env.ALPHA_ALLOWED_EMAILS = actor === "owner" ? editorEmail : ownerEmail;
    const response = await invoke();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "beta_invite_required" }) }));
    expect(await mockCurrentDb.select().from(giftPublishSessions)).toHaveLength(2);
    expect(await mockCurrentDb.select().from(giftManagementRequests)).toEqual([]);
    const [album] = await mockCurrentDb.select().from(sharedAlbums);
    expect(album.version).toBe(1);
    for (const operation of Object.values(mockMedia)) expect(operation).not.toHaveBeenCalled();
  });

  it.each(routes)("keeps %s available to an allowed %s", async (_name, _actor, invoke, status) => {
    expect((await invoke()).status).toBe(status);
  });

  it.each(routes)("pauses %s for an allowed %s", async (_name, _actor, invoke) => {
    process.env.GIFT_SHARING_ENABLED = "false";
    const response = await invoke();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "gift_sharing_paused" }) }));
  });

  it.each([undefined, "", " , "])("keeps external Beta open when the Alpha list is %s", async list => {
    if (list === undefined) delete process.env.ALPHA_ALLOWED_EMAILS; else process.env.ALPHA_ALLOWED_EMAILS = list;
    expect((await readOwnedAlbum(request("owner", "GET"), { id: giftId })).status).toBe(200);
    expect((await editorPOST(request("editor", "POST", publishBody), { id: giftId })).status).toBe(201);
  });

  it.each(["owner", "editor"] as const)("continues to reject a deletion-pending %s with an unrevoked old token", async actor => {
    await mockCurrentDb.update(users).set({ deletionState: "pending", deletionRequestedAt: new Date().toISOString() }).where(eq(users.email, actor === "owner" ? ownerEmail : editorEmail));
    const response = actor === "owner" ? await readOwnedAlbum(request(actor, "GET"), { id: giftId }) : await editorPOST(request(actor, "POST", publishBody), { id: giftId });
    expect(response.status).toBe(401);
    await expect(requireAuthenticatedAccountSession(request(actor, "POST"), mockCurrentDb)).rejects.toMatchObject({ status: 401, code: "unauthorized" });
  });

  it("lets a removed Alpha account log out during a sharing pause", async () => {
    process.env.ALPHA_ALLOWED_EMAILS = editorEmail; process.env.GIFT_SHARING_ENABLED = "false";
    expect((await logout(request("owner", "POST"))).status).toBe(204);
    expect(await getAuthenticatedUserByTokenHash(mockCurrentDb, await hashAccessToken(ownerToken, syntheticPepper), new Date().toISOString())).toBeNull();
  });

  it("preserves session-bound account deletion after Alpha removal and a sharing pause", async () => {
    process.env.ALPHA_ALLOWED_EMAILS = editorEmail; process.env.GIFT_SHARING_ENABLED = "false";
    process.env.RESEND_API_KEY = "synthetic-test-only"; process.env.GIFT_EMAIL_FROM = "support@example.test";
    const challengeResponse = await requestDeletionChallenge(request("owner", "POST"));
    expect(challengeResponse.status).toBe(200);
    const challenge = await challengeResponse.json() as { challengeId: string };
    const code = mockSendDeletionCode.mock.calls[0][0].code;
    const response = await deleteAccount(request("owner", "DELETE", { challengeId: challenge.challengeId, code, confirmation: "DELETE" }));
    expect(response.status).toBe(202);
    const [job] = await mockCurrentDb.select().from(accountDeletionJobs);
    expect(job.state).toBe("pending");
    expect(await getAuthenticatedUserByTokenHash(mockCurrentDb, await hashAccessToken(ownerToken, syntheticPepper), new Date().toISOString())).toBeNull();
  });

  it("allows an eligible owner to disable during a pause but denies an editor", async () => {
    process.env.GIFT_SHARING_ENABLED = "false";
    expect((await disableOwnedGift(request("editor", "POST"), { id: giftId })).status).toBe(403);
    expect((await disableOwnedGift(request("owner", "POST"), { id: giftId })).status).toBe(204);
  });

  it("retains permitted admin retirement during a pause", async () => {
    const now = new Date().toISOString(), expiresAt = new Date(Date.now() + 600_000).toISOString();
    const admin = await createOrGetUserByEmail(mockCurrentDb, adminEmail, now);
    await createAuthSession(mockCurrentDb, { id: "admin-session", userId: admin.id, tokenHash: await hashAccessToken("local-admin-token", syntheticPepper), createdAt: now, expiresAt });
    await createInitializingGiftCard(mockCurrentDb, { cardId: "local-admin-card", cardCode: "LOCAL-CARD", giftId: "local-admin-gift", tokenHash: "local-admin-gift-hash", note: null, adminEmail, createdAt: now, expiresAt });
    await activateGiftCard(mockCurrentDb, "local-admin-card", adminEmail, now);
    process.env.GIFT_SHARING_ENABLED = "false";
    const response = await retireAdminCard(new Request("https://local.test/api/admin/gift-cards/retire", { method: "POST", headers: { Authorization: "Bearer local-admin-token" } }), { id: "local-admin-card" });
    expect(response.status).toBe(200);
  });
});
