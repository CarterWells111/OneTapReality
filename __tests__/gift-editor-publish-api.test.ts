import { ApiError } from "../src/server/http/errors";
import { prepareSharedPublication, promoteSharedPublication, promoteSharedPublicationDurably, selectRefreshableUploads, verifySharedPublication } from "../src/server/gifts/shared-publication";

const mockRequireAccount = jest.fn(async (..._args: unknown[]) => ({ id: "editor-user", email: "editor@example.com" }));
const mockGetAccess = jest.fn(async (..._args: unknown[]): Promise<any> => ({ memberId: "member-1", id: "gift-1", status: "bound", role: "editor", albumId: "album-1", version: 1 }));
const mockCreateSession = jest.fn(async (..._args: unknown[]) => undefined);
const mockGetPayload = jest.fn(async (..._args: unknown[]): Promise<any> => ({ sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ position: 0, objectKey: "gifts/gift-1/session-1/temp/photo", contentType: "image/jpeg", byteSize: 12, source: "upload" }], cover: null }));
const mockGetReceipt = jest.fn(async (..._args: unknown[]): Promise<any> => null);
const mockCompleteSession = jest.fn(async (..._args: unknown[]): Promise<any> => ({ albumId: "album-1", version: 2, oldObjectKeys: [] }));
const mockMetadata = jest.fn(async (..._args: unknown[]): Promise<any> => ({ contentType: "image/jpeg", byteSize: 12 }));
const mockResolveExisting = jest.fn(async (..._args: unknown[]): Promise<any> => [{ position: 0, objectKey: "gifts/gift-1/old/photo", contentType: "image/jpeg", byteSize: 9 }]);
const mockDeleteObjects = jest.fn(async (..._args: unknown[]) => undefined);
const mockCopyObject = jest.fn(async (..._args: unknown[]) => undefined);
const mockEnqueueCleanup = jest.fn(async (..._args: unknown[]) => undefined);
const mockCreateUploadUrl = jest.fn(async (input: { objectKey: string }) => `https://upload.test/${input.objectKey.split("/").at(-1)}`);

jest.mock("../src/server/db/client", () => ({ getServerDatabase: jest.fn(() => ({})) }));
jest.mock("../src/server/gifts/owner-access", () => ({ requireOwnedGift: jest.fn(async () => ({ db: {}, email: "owner@example.com", gift: { id: "gift-1", status: "bound" } })) }));
jest.mock("../src/server/gifts/session-auth", () => ({ requireGiftSessionEmail: jest.fn(async () => "owner@example.com"), hashGiftToken: jest.fn(async () => "hash") }));
jest.mock("../src/server/auth/session-auth", () => ({ requireAuthenticatedAccount: (...args: unknown[]) => mockRequireAccount(...args) }));
jest.mock("../src/server/gifts/member-access", () => ({ getActivatedGiftMemberAccess: (...args: unknown[]) => mockGetAccess(...args) }));
jest.mock("../src/server/gifts/r2-media", () => ({ getR2MediaStoreFromEnvironment: jest.fn(() => ({ createUploadUrl: (...args: [{ objectKey: string }]) => mockCreateUploadUrl(...args), getObjectMetadata: (...args: unknown[]) => mockMetadata(...args), copyObject: (...args: unknown[]) => mockCopyObject(...args), deleteObjects: (...args: unknown[]) => mockDeleteObjects(...args) })) }));
jest.mock("../src/server/gifts/repository", () => {
  class Conflict extends Error { code = "gift_album_version_conflict"; }
  class Unavailable extends Error { code = "gift_publication_unavailable"; }
  return {
    GiftAlbumVersionConflictError: Conflict,
    GiftPublicationUnavailableError: Unavailable,
    createGiftPublishSession: (...args: unknown[]) => mockCreateSession(...args),
    getGiftPublishPayload: (...args: unknown[]) => mockGetPayload(...args),
    getGiftPublishCompletionReceipt: (...args: unknown[]) => mockGetReceipt(...args),
    completeGiftPublishSession: (...args: unknown[]) => mockCompleteSession(...args),
    completeGiftPublishSessionResult: async (...args: unknown[]) => {
      try { const result = await mockCompleteSession(...args); return result ? { status: "success", ...result } : { status: "access_denied" }; }
      catch (error) { if (error instanceof Conflict) return { status: "conflict" }; throw error; }
    },
    reserveGiftPublicationPromotion: (...args: unknown[]) => mockEnqueueCleanup(...args),
    resolveExistingGiftMedia: (...args: unknown[]) => mockResolveExisting(...args),
    getGiftAccessByTokenHash: jest.fn(async () => ({ id: "gift-1", status: "bound", role: "owner" })),
  };
});

import { GiftAlbumVersionConflictError, GiftPublicationUnavailableError } from "../src/server/gifts/repository";
import { PATCH, POST, PUT } from "../src/app/api/gifts/invited/[id]/publish+api";
import { PATCH as ownedPATCH, POST as ownedPOST, PUT as ownedPUT } from "../src/app/api/my-gifts/[id]/publish+api";
import { PATCH as tokenPATCH, POST as tokenPOST, PUT as tokenPUT } from "../src/app/api/gifts/[token]/publish+api";

describe("editor shared publication contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GIFT_SHARING_ENABLED = "true";
    mockGetAccess.mockResolvedValue({ memberId: "member-1", id: "gift-1", status: "bound", role: "editor", albumId: "album-1", version: 1 });
    mockGetPayload.mockResolvedValue({ sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ position: 0, objectKey: "gifts/gift-1/session-1/temp/photo", contentType: "image/jpeg", byteSize: 12, source: "upload" }], cover: null });
    mockGetReceipt.mockResolvedValue(null);
    mockCompleteSession.mockResolvedValue({ albumId: "album-1", version: 2, oldObjectKeys: [] });
    mockMetadata.mockResolvedValue({ contentType: "image/jpeg", byteSize: 12 });
    mockResolveExisting.mockResolvedValue([{ position: 0, objectKey: "gifts/gift-1/old/photo", contentType: "image/jpeg", byteSize: 9 }]);
    mockDeleteObjects.mockResolvedValue(undefined);
    mockCopyObject.mockResolvedValue(undefined);
    mockEnqueueCleanup.mockResolvedValue(undefined);
    mockCreateUploadUrl.mockImplementation(async (input: { objectKey: string }) => `https://upload.test/${input.objectKey.split("/").at(-1)}`);
  });

  it("selects only requested server-owned upload keys for refresh", () => {
    const payload = {
      sourceMemoryId: "memory", title: "Trip", pages: [],
      media: [
        { position: 1, objectKey: "one", contentType: "image/jpeg", byteSize: 1, source: "upload" as const },
        { position: 2, objectKey: "existing", contentType: "image/jpeg", byteSize: 1, source: "existing" as const },
        { position: 3, objectKey: "three", contentType: "image/jpeg", byteSize: 1, source: "upload" as const },
      ],
      cover: { objectKey: "cover", contentType: "image/jpeg", byteSize: 1 },
    };
    expect(selectRefreshableUploads({ publicationId: "publication-1", positions: [1, 3], cover: true }, payload)).toEqual({
      media: [payload.media[0], payload.media[2]], cover: payload.cover,
    });
    expect(() => selectRefreshableUploads({ publicationId: "publication-1", positions: [2] }, payload)).toThrow(ApiError);
    expect(() => selectRefreshableUploads({ publicationId: "publication-1", positions: [1, 1] }, payload)).toThrow(ApiError);
    expect(() => selectRefreshableUploads({ publicationId: "publication-1", positions: [-1] }, payload)).toThrow(ApiError);
    expect(() => selectRefreshableUploads({ publicationId: "publication-1", positions: [99] }, payload)).toThrow(ApiError);
  });

  it.each([
    ["invited", (req: Request) => PATCH(req, { id: "gift-1" })],
    ["owned", (req: Request) => ownedPATCH(req, { id: "gift-1" })],
    ["token", (req: Request) => tokenPATCH(req, { token: "token" })],
  ] as const)("refreshes only selected %s publication uploads with a scoped lookup", async (_name, invoke) => {
    mockGetPayload.mockResolvedValueOnce({
      sourceMemoryId: "memory", title: "Trip", pages: [],
      media: [
        { position: 1, objectKey: "gifts/gift-1/session/one", contentType: "image/jpeg", byteSize: 1, source: "upload" },
        { position: 3, objectKey: "gifts/gift-1/session/three", contentType: "image/jpeg", byteSize: 1, source: "upload" },
      ],
      cover: { objectKey: "gifts/gift-1/session/cover", contentType: "image/jpeg", byteSize: 1 },
    });
    const response = await invoke(request("PATCH", { publicationId: "publication-1", positions: [1, 3], cover: true, objectKey: "attacker-key" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      uploads: [
        { position: 1, uploadUrl: "https://upload.test/one" },
        { position: 3, uploadUrl: "https://upload.test/three" },
      ],
      coverUpload: { uploadUrl: "https://upload.test/cover" },
    });
    expect(mockGetPayload).toHaveBeenLastCalledWith(expect.anything(), "publication-1", "gift-1", expect.any(String), expect.any(String));
    expect(mockCreateUploadUrl).not.toHaveBeenCalledWith(expect.objectContaining({ objectKey: "attacker-key" }));
  });

  it("returns publication_unavailable when refresh lookup is expired", async () => {
    mockGetPayload.mockResolvedValueOnce(null);
    const response = await PATCH(request("PATCH", { publicationId: "expired", positions: [1], cover: false }), { id: "gift-1" });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "gift_publication_unavailable" }) }));
  });

  const request = (method: string, body: unknown) => new Request("http://localhost/api/gifts/invited/gift-1/publish", { method, headers: { Authorization: "Bearer session", "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("rejects viewers and unactivated editors before creating an upload session", async () => {
    mockGetAccess.mockResolvedValueOnce(null as never);
    const response = await POST(request("POST", { baseVersion: 1, sourceMemoryId: "memory", title: "Trip", pages: [], media: [] }), { id: "gift-1" });
    expect(response.status).toBe(403);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it("resolves existing media server-side and uploads only new media", async () => {
    const response = await POST(request("POST", { baseVersion: 1, sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ position: 0, mediaId: "media-1" }, { position: 1, contentType: "image/jpeg", byteSize: 12 }] }), { id: "gift-1" });
    expect(response.status).toBe(201);
    expect(mockResolveExisting).toHaveBeenCalledWith(expect.anything(), "gift-1", 1, [{ position: 0, mediaId: "media-1" }]);
    const session = mockCreateSession.mock.calls[0][1] as { payload: { media: { objectKey: string }[] } };
    expect(session.payload.media.map(item => item.objectKey)).toEqual(expect.arrayContaining(["gifts/gift-1/old/photo"]));
    const body = await response.json() as { uploads: unknown[] };
    expect(body.uploads).toHaveLength(1);
  });

  it("maps a stale existing-media base version during POST to 409", async () => {
    mockResolveExisting.mockRejectedValueOnce(new GiftAlbumVersionConflictError());
    const response = await POST(request("POST", { baseVersion: 1, sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ position: 0, mediaId: "media-1" }] }), { id: "gift-1" });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "gift_album_version_conflict" }) }));
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it.each([
    ["invited", (req: Request) => POST(req, { id: "gift-1" })],
    ["owned", (req: Request) => ownedPOST(req, { id: "gift-1" })],
    ["token", (req: Request) => tokenPOST(req, { token: "token" })],
  ] as const)("maps a deletion-race publication rejection to 409 at the %s entry", async (_name, invoke) => {
    mockCreateSession.mockRejectedValueOnce(new GiftPublicationUnavailableError());

    const response = await invoke(request("POST", { baseVersion: 0, sourceMemoryId: "memory", title: "Trip", pages: [], media: [] }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "gift_publication_unavailable" }) }));
  });

  it("rechecks editor access on PUT before reading metadata", async () => {
    mockGetAccess.mockResolvedValueOnce(null as never);
    const response = await PUT(request("PUT", { publicationId: "session-1" }), { id: "gift-1" });
    expect(response.status).toBe(403);
    expect(mockMetadata).not.toHaveBeenCalled();
    expect(mockCompleteSession).not.toHaveBeenCalled();
  });

  it("rejects a suspended PUT through the kill switch", async () => {
    process.env.GIFT_SHARING_ENABLED = "false";
    const response = await PUT(request("PUT", { publicationId: "session-1" }), { id: "gift-1" });
    expect(response.status).toBe(503);
    expect(mockGetPayload).not.toHaveBeenCalled();
  });

  it.each([
    ["invited", (req: Request) => PUT(req, { id: "gift-1" })],
    ["owned", (req: Request) => ownedPUT(req, { id: "gift-1" })],
    ["token", (req: Request) => tokenPUT(req, { token: "token" })],
  ] as const)("returns the shared retryable contract from the %s finalization route", async (_name, invoke) => {
    mockMetadata.mockRejectedValue(new Error("temporary R2 outage"));

    const response = await invoke(request("PUT", { publicationId: "session-1" }));

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("2");
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "gift_publication_retryable" }) }));
    expect(mockCompleteSession).not.toHaveBeenCalled();
  });

  it.each([
    ["invited", (req: Request) => PUT(req, { id: "gift-1" })],
    ["owned", (req: Request) => ownedPUT(req, { id: "gift-1" })],
    ["token", (req: Request) => tokenPUT(req, { token: "token" })],
  ] as const)("returns the persisted completion receipt from a repeated %s PUT without touching R2", async (_name, invoke) => {
    mockGetReceipt.mockResolvedValueOnce({ albumId: "album-complete", version: 4 });

    const response = await invoke(request("PUT", { publicationId: "session-1" }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ albumId: "album-complete", version: 4 });
    expect(mockGetPayload).not.toHaveBeenCalled();
    expect(mockMetadata).not.toHaveBeenCalled();
    expect(mockCopyObject).not.toHaveBeenCalled();
  });

  it("returns a persisted receipt even when media storage is temporarily unavailable", async () => {
    const getStore = jest.requireMock("../src/server/gifts/r2-media").getR2MediaStoreFromEnvironment as jest.Mock;
    mockGetReceipt.mockResolvedValueOnce({ albumId: "album-complete", version: 4 });
    getStore.mockReturnValueOnce(null);

    const response = await ownedPUT(request("PUT", { publicationId: "session-1" }), { id: "gift-1" });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ albumId: "album-complete", version: 4 });
    expect(mockGetPayload).not.toHaveBeenCalled();
  });

  it("logs only privacy-safe finalization fields", async () => {
    const log = jest.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      mockGetPayload.mockResolvedValueOnce({ sourceMemoryId: "sensitive-memory-id", title: "Sensitive title", pages: [], media: [{ position: 0, objectKey: "gifts/sensitive-gift/session-1/temp/secret-photo", contentType: "image/jpeg", byteSize: 12, source: "upload" }], cover: null });
      const response = await PUT(request("PUT", { publicationId: "session-1" }), { id: "sensitive-gift" });
      expect(response.status).toBe(201);
      const serialized = JSON.stringify(log.mock.calls);
      expect(serialized).toContain("gift_publication_finalize");
      for (const sensitive of ["editor@example.com", "sensitive-gift", "session-1", "secret-photo", "Sensitive title", "sensitive-memory-id", "https://"]) {
        expect(serialized).not.toContain(sensitive);
      }
      expect(serialized).toContain("durationMs");
      expect(serialized).toContain("outcome");
      expect(serialized).toContain("errorCode");
    } finally {
      log.mockRestore();
    }
  });

  it("maps a transaction-time stale version to 409 after metadata verification", async () => {
    mockCompleteSession.mockRejectedValueOnce(new GiftAlbumVersionConflictError());
    const response = await PUT(request("PUT", { publicationId: "session-1" }), { id: "gift-1" });
    expect(mockMetadata).toHaveBeenCalled();
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "gift_album_version_conflict" }) }));
  });

  it("rejects a role removed inside the completion transaction after metadata verification", async () => {
    mockCompleteSession.mockResolvedValueOnce(null as never);
    const response = await PUT(request("PUT", { publicationId: "session-1" }), { id: "gift-1" });
    expect(mockMetadata).toHaveBeenCalled();
    expect(response.status).toBe(409);
  });

  it("does not delete promoted final objects for an unknown completion error", async () => {
    mockGetPayload.mockResolvedValueOnce({ sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ position: 0, objectKey: "gifts/gift-1/session-1/temp/photo", contentType: "image/jpeg", byteSize: 12, source: "upload" }], cover: null });
    mockCompleteSession.mockRejectedValueOnce(new Error("database response lost"));
    const response = await PUT(request("PUT", { publicationId: "session-1" }), { id: "gift-1" });
    expect(response.status).toBe(500);
    expect(mockDeleteObjects).not.toHaveBeenCalledWith([expect.stringContaining("/final/")]);
    expect(mockEnqueueCleanup).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      giftId: "gift-1", sessionId: "session-1", ownerEmail: "editor@example.com",
      objectKeys: [expect.stringContaining("/final/")], now: expect.any(String),
    }));
  });

  it("durably records attempted final keys when promotion cleanup cannot establish completion", async () => {
    mockGetPayload.mockResolvedValueOnce({ sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ position: 0, objectKey: "gifts/gift-1/session-1/temp/photo", contentType: "image/jpeg", byteSize: 12, source: "upload" }], cover: null });
    mockMetadata.mockResolvedValue(null);
    mockCopyObject.mockRejectedValue(new Error("R2 copy failed"));

    const response = await PUT(request("PUT", { publicationId: "session-1" }), { id: "gift-1" });

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("2");
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "gift_publication_retryable" }) }));
    expect(mockCompleteSession).not.toHaveBeenCalled();
    expect(mockEnqueueCleanup).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      giftId: "gift-1", sessionId: "session-1", ownerEmail: "editor@example.com",
      objectKeys: [expect.stringContaining("/final/")], now: expect.any(String),
    }));
    expect(mockEnqueueCleanup.mock.invocationCallOrder[0]).toBeLessThan(mockCopyObject.mock.invocationCallOrder[0]);
  });

  it("does not write any R2 final when candidate pre-registration fails", async () => {
    mockGetPayload.mockResolvedValueOnce({ sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ position: 0, objectKey: "gifts/gift-1/session-1/temp/photo", contentType: "image/jpeg", byteSize: 12, source: "upload" }], cover: null });
    mockEnqueueCleanup.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await PUT(request("PUT", { publicationId: "session-1" }), { id: "gift-1" });

    expect(response.status).toBe(500);
    expect(mockCopyObject).not.toHaveBeenCalled();
    expect(mockCompleteSession).not.toHaveBeenCalled();
  });

  it("returns the same result for concurrent finalization attempts without deleting their deterministic R2 object", async () => {
    const tempKey = "gifts/gift-1/session-1/temp/photo";
    mockGetPayload.mockImplementation(async () => ({ sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ position: 0, objectKey: tempKey, contentType: "image/jpeg", byteSize: 12, source: "upload" }], cover: null }));
    const completedPayloads: string[] = [];
    mockCompleteSession.mockImplementation(async (...args: unknown[]) => {
      const input = args[1] as { payload?: { media: { objectKey: string }[] } };
      const finalKey = input.payload?.media[0].objectKey;
      if (finalKey) completedPayloads.push(finalKey);
      return { albumId: "album-1", version: 2, oldObjectKeys: [], replayed: completedPayloads.length > 1 };
    });

    const responses = await Promise.all([
      PUT(request("PUT", { publicationId: "session-1" }), { id: "gift-1" }),
      PUT(request("PUT", { publicationId: "session-1" }), { id: "gift-1" }),
    ]);

    expect(responses.map(response => response.status)).toEqual([201, 201]);
    expect(completedPayloads).toHaveLength(2);
    expect(new Set(completedPayloads).size).toBe(1);
    expect(completedPayloads.every(key => key.includes("/final/"))).toBe(true);
    expect(mockDeleteObjects).not.toHaveBeenCalledWith([completedPayloads[0]]);
    expect(await mockMetadata(completedPayloads[0])).toEqual({ contentType: "image/jpeg", byteSize: 12 });
  });
  it("requires a base version before creating server-owned object keys", () => {
    expect(() => prepareSharedPublication({ sourceMemoryId: "memory", title: "Trip", pages: [], media: [] }, "gift-1", "session-1")).toThrow(ApiError);
    const prepared = prepareSharedPublication({ baseVersion: 3, sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ contentType: "image/jpeg", byteSize: 12 }] }, "gift-1", "session-1");
    expect(prepared.baseVersion).toBe(3);
    expect(prepared.payload.media[0].objectKey).toMatch(/^gifts\/gift-1\/session-1\//u);
  });

  it("normalizes a shared album travel date into the server-owned payload", () => {
    const dated = prepareSharedPublication({ baseVersion: 0, sourceMemoryId: "memory", title: "Trip", travelDate: "2026-08-21", pages: [], media: [] }, "gift-1", "session-1");
    const undated = prepareSharedPublication({ baseVersion: 0, sourceMemoryId: "memory", title: "Trip", travelDate: null, pages: [], media: [] }, "gift-1", "session-1");

    expect(dated.payload.travelDate).toBe("2026-08-21");
    expect(undated.payload.travelDate).toBeNull();
  });

  it("accepts four-digit shared album years below 100", () => {
    const prepared = prepareSharedPublication({ baseVersion: 0, sourceMemoryId: "memory", title: "Trip", travelDate: "0099-01-01", pages: [], media: [] }, "gift-1", "session-1");

    expect(prepared.payload.travelDate).toBe("0099-01-01");
  });

  it.each(["21/08/2026", "2026-02-30"]) ("rejects invalid shared album travel date %s", (travelDate) => {
    expect(() => prepareSharedPublication({ baseVersion: 0, sourceMemoryId: "memory", title: "Trip", travelDate, pages: [], media: [] }, "gift-1", "session-1")).toThrow(expect.objectContaining({ status: 400, code: "validation_failed" }));
  });

  it.each([
    { baseVersion: 0, sourceMemoryId: "memory", title: "Trip", pages: {}, media: [] },
    { baseVersion: 0, sourceMemoryId: "memory", title: "Trip", pages: [null], media: [] },
    { baseVersion: 0, sourceMemoryId: "memory", title: "Trip", pages: [], media: [7] },
    { baseVersion: 0, sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ position: -1, mediaId: "media" }] },
    { baseVersion: 0, sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ position: 0, mediaId: "a" }, { position: 0, mediaId: "b" }] },
    { baseVersion: 0, sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ mediaId: "" }] },
    { baseVersion: 0, sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ mediaId: "a", objectKey: "client-key" }] },
  ])("rejects malformed publication payload %# with validation_failed", async (body) => {
    const response = await POST(request("POST", body), { id: "gift-1" });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "validation_failed" }) }));
  });

  it.each([
    ["invited", (req: Request) => POST(req, { id: "gift-1" })],
    ["owned", (req: Request) => ownedPOST(req, { id: "gift-1" })],
    ["token", (req: Request) => tokenPOST(req, { token: "token" })],
  ] as const)("returns validation_failed for null page entries at the %s publish entry", async (_name, invoke) => {
    const response = await invoke(request("POST", { baseVersion: 0, sourceMemoryId: "memory", title: "Trip", pages: [null], media: [] }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "validation_failed" }) }));
  });

  it("lets the account owner reuse media after server-side gift/version validation", async () => {
    const response = await ownedPOST(request("POST", { baseVersion: 0, sourceMemoryId: "shared:gift-1", title: "Trip", pages: [], media: [{ position: 0, mediaId: "media-1" }] }), { id: "gift-1" });
    expect(response.status).toBe(201);
    expect(mockResolveExisting).toHaveBeenCalledWith(expect.anything(), "gift-1", 0, [{ position: 0, mediaId: "media-1" }]);
    const body = await response.json() as { uploads: unknown[] };
    expect(body.uploads).toEqual([]);
  });

  it("continues to reject existing media references at the legacy token owner publish entry", async () => {
    const response = await tokenPOST(request("POST", { baseVersion: 0, sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ position: 0, mediaId: "media-1" }] }), { token: "token" });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "validation_failed" }) }));
  });

  it("rejects uploaded objects whose private R2 metadata does not match", async () => {
    const prepared = prepareSharedPublication({ baseVersion: 0, sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ contentType: "image/jpeg", byteSize: 12 }] }, "gift-1", "session-1");
    const store = { getObjectMetadata: jest.fn(async () => ({ contentType: "image/png", byteSize: 12 })) };
    await expect(verifySharedPublication(store as never, prepared.payload)).rejects.toEqual(expect.objectContaining({ code: "gift_upload_incomplete" }));
  });

  it("promotes 20 slow media objects plus a cover within the request budget using at most four operations", async () => {
    jest.useFakeTimers();
    try {
      const publicationId = "slow-publication";
      const payload = prepareSharedPublication({
        baseVersion: 0,
        sourceMemoryId: "memory",
        title: "Trip",
        pages: [],
        media: Array.from({ length: 20 }, (_, position) => ({ position, contentType: "image/jpeg", byteSize: 12 })),
        cover: { contentType: "image/jpeg", byteSize: 7 },
      }, "gift-1", publicationId).payload;
      const copied = new Set<string>();
      let activeOperations = 0;
      let maxConcurrentOperations = 0;
      const slow = async () => {
        activeOperations += 1;
        maxConcurrentOperations = Math.max(maxConcurrentOperations, activeOperations);
        await new Promise(resolve => setTimeout(resolve, 400));
        activeOperations -= 1;
      };
      const store = {
        copyObject: jest.fn(async (_source: string, destination: string) => { await slow(); copied.add(destination); }),
        getObjectMetadata: jest.fn(async (objectKey: string) => { await slow(); return copied.has(objectKey) ? { contentType: objectKey.endsWith("cover") ? "image/jpeg" : "image/jpeg", byteSize: objectKey.endsWith("cover") ? 7 : 12 } : null; }),
        deleteObjects: jest.fn(async () => undefined),
      };

      const promotion = promoteSharedPublicationDurably({ store: store as never, db: {} as never, giftId: "gift-1", sessionId: publicationId, ownerEmail: "owner@example.com", payload, now: "2026-09-06T00:00:00.000Z" });
      const completed = expect(promotion).resolves.toHaveLength(21);
      await jest.advanceTimersByTimeAsync(120_000);
      await completed;
      expect(maxConcurrentOperations).toBeGreaterThan(1);
      expect(maxConcurrentOperations).toBeLessThanOrEqual(4);
    } finally {
      jest.useRealTimers();
    }
  });

  it("promotes the maximum 50 media objects plus a cover with four or fewer workers", async () => {
    const publicationId = "maximum-publication";
    const payload = prepareSharedPublication({
      baseVersion: 0, sourceMemoryId: "memory", title: "Trip", pages: [],
      media: Array.from({ length: 50 }, (_, position) => ({ position, contentType: "image/jpeg", byteSize: 12 })),
      cover: { contentType: "image/jpeg", byteSize: 7 },
    }, "gift-1", publicationId).payload;
    const copied = new Set<string>();
    let active = 0;
    let maximum = 0;
    const store = {
      copyObject: jest.fn(async (_source: string, destination: string) => {
        active += 1; maximum = Math.max(maximum, active);
        await Promise.resolve(); copied.add(destination); active -= 1;
      }),
      getObjectMetadata: jest.fn(async (objectKey: string) => copied.has(objectKey)
        ? { contentType: "image/jpeg", byteSize: objectKey.endsWith("cover") ? 7 : 12 }
        : null),
      deleteObjects: jest.fn(async () => undefined),
    };

    await expect(promoteSharedPublicationDurably({ store: store as never, db: {} as never, giftId: "gift-1", sessionId: publicationId, ownerEmail: "owner@example.com", payload, now: "2026-09-06T00:00:00.000Z" })).resolves.toHaveLength(51);
    expect(maximum).toBeLessThanOrEqual(4);
  });

  it("reuses a matching deterministic final object and copies only missing destinations", async () => {
    const publicationId = "resume-publication";
    const payload = prepareSharedPublication({
      baseVersion: 0, sourceMemoryId: "memory", title: "Trip", pages: [],
      media: [
        { position: 0, contentType: "image/jpeg", byteSize: 11 },
        { position: 1, contentType: "image/jpeg", byteSize: 12 },
      ],
    }, "gift-1", publicationId).payload;
    const verifiedFinalKey = payload.media[0].objectKey.replace("/temp/", "/final/");
    const missingFinalKey = payload.media[1].objectKey.replace("/temp/", "/final/");
    const available = new Set([verifiedFinalKey]);
    const store = {
      copyObject: jest.fn(async (_source: string, destination: string) => { available.add(destination); }),
      getObjectMetadata: jest.fn(async (objectKey: string) => available.has(objectKey)
        ? { contentType: "image/jpeg", byteSize: objectKey === verifiedFinalKey ? 11 : 12 }
        : null),
      deleteObjects: jest.fn(async () => undefined),
    };

    const finals = await promoteSharedPublicationDurably({ store: store as never, db: {} as never, giftId: "gift-1", sessionId: publicationId, ownerEmail: "owner@example.com", payload, now: "2026-09-06T00:00:00.000Z" });
    expect(finals).toEqual([verifiedFinalKey, missingFinalKey]);
    expect(store.copyObject.mock.calls.map(([, destination]) => destination)).not.toContain(verifiedFinalKey);
    expect(store.copyObject.mock.calls.map(([, destination]) => destination)).toContain(missingFinalKey);
  });

  it("retries a transient object copy per item and classifies exhaustion as retryable", async () => {
    jest.useFakeTimers();
    try {
      const publicationId = "retry-publication";
      const payload = prepareSharedPublication({ baseVersion: 0, sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ contentType: "image/jpeg", byteSize: 12 }] }, "gift-1", publicationId).payload;
      let copyAttempts = 0;
      const copied = new Set<string>();
      const store = {
        copyObject: jest.fn(async (_source: string, destination: string) => {
          copyAttempts += 1;
          if (copyAttempts < 2) throw new Error("temporary R2 outage");
          copied.add(destination);
        }),
        getObjectMetadata: jest.fn(async (objectKey: string) => copied.has(objectKey) ? { contentType: "image/jpeg", byteSize: 12 } : null),
        deleteObjects: jest.fn(async () => undefined),
      };
      const promotion = promoteSharedPublicationDurably({ store: store as never, db: {} as never, giftId: "gift-1", sessionId: publicationId, ownerEmail: "owner@example.com", payload, now: "2026-09-06T00:00:00.000Z" });
      await jest.advanceTimersByTimeAsync(1_000);
      await expect(promotion).resolves.toHaveLength(1);
      expect(copyAttempts).toBe(2);

      const permanentlyFailing = {
        ...store,
        copyObject: jest.fn(async () => { throw new Error("R2 unavailable"); }),
        getObjectMetadata: jest.fn(async () => null),
      };
      const retryable = promoteSharedPublicationDurably({ store: permanentlyFailing as never, db: {} as never, giftId: "gift-1", sessionId: publicationId, ownerEmail: "owner@example.com", payload: prepareSharedPublication({ baseVersion: 0, sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ contentType: "image/jpeg", byteSize: 12 }] }, "gift-1", publicationId).payload, now: "2026-09-06T00:00:00.000Z" });
      const rejected = expect(retryable).rejects.toEqual(expect.objectContaining({ code: "gift_publication_retryable" }));
      await jest.advanceTimersByTimeAsync(2_000);
      await rejected;
      expect(permanentlyFailing.copyObject).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps post-copy metadata mismatch non-retryable", async () => {
    const publicationId = "mismatch-publication";
    const payload = prepareSharedPublication({ baseVersion: 0, sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ contentType: "image/jpeg", byteSize: 12 }] }, "gift-1", publicationId).payload;
    const store = {
      copyObject: jest.fn(async () => undefined),
      getObjectMetadata: jest.fn(async () => ({ contentType: "image/png", byteSize: 12 })),
      deleteObjects: jest.fn(async () => undefined),
    };

    await expect(promoteSharedPublicationDurably({ store: store as never, db: {} as never, giftId: "gift-1", sessionId: publicationId, ownerEmail: "owner@example.com", payload, now: "2026-09-06T00:00:00.000Z" })).rejects.toEqual(expect.objectContaining({ code: "gift_upload_incomplete" }));
    expect(store.copyObject).toHaveBeenCalledTimes(1);
  });

  it.each(["copy", "head"] as const)("keeps deterministic final objects registered for durable cleanup when %s has a transient failure", async (stage) => {
    const payload = prepareSharedPublication({ baseVersion: 0, sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ contentType: "image/jpeg", byteSize: 12 }] }, "gift-1", "session-1").payload;
    const deleted: string[][] = [];
    const store = {
      copyObject: jest.fn(async () => { if (stage === "copy") throw new Error("copy failed"); }),
      getObjectMetadata: jest.fn(async () => { if (stage === "head") throw new Error("head failed"); return null; }),
      deleteObjects: jest.fn(async (keys: string[]) => { deleted.push(keys); }),
    };
    await expect(promoteSharedPublication(store as never, payload)).rejects.toEqual(expect.objectContaining({ code: "gift_publication_retryable" }));
    expect(deleted).toEqual([]);
  });

  it("aborts a copy that does not settle within the 120-second publication safety budget", async () => {
    jest.useFakeTimers();
    try {
      const payload = prepareSharedPublication({ baseVersion: 0, sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ contentType: "image/jpeg", byteSize: 12 }] }, "gift-1", "session-1").payload;
      let copySignal: AbortSignal | undefined;
      const store = {
        copyObject: jest.fn((_source: string, _destination: string, options?: { abortSignal?: AbortSignal }) => {
          copySignal = options?.abortSignal;
          return new Promise<void>(() => undefined);
        }),
        getObjectMetadata: jest.fn(async () => null),
        deleteObjects: jest.fn(async () => undefined),
      };

      const promotion = promoteSharedPublication(store as never, payload);
      const rejected = expect(promotion).rejects.toEqual(expect.objectContaining({ code: "gift_publication_retryable" }));
      await jest.advanceTimersByTimeAsync(120_000);

      await rejected;
      expect(copySignal?.aborted).toBe(true);
      expect(store.deleteObjects).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("uses the same deterministic final keys for concurrent retries and leaves temp objects available", async () => {
    const first = prepareSharedPublication({ baseVersion: 0, sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ contentType: "image/jpeg", byteSize: 12 }] }, "gift-1", "session-1").payload;
    const second = structuredClone(first);
    const deleted: string[][] = [];
    const store = {
      copyObject: jest.fn(async () => undefined),
      getObjectMetadata: jest.fn(async () => ({ contentType: "image/jpeg", byteSize: 12 })),
      deleteObjects: jest.fn(async (keys: string[]) => { deleted.push(keys); }),
    };

    const [firstFinals, secondFinals] = await Promise.all([
      promoteSharedPublication(store as never, first),
      promoteSharedPublication(store as never, second),
    ]);

    expect(firstFinals[0]).toBe(secondFinals[0]);
    expect(firstFinals[0]).toMatch(/\/session-1\/final\//u);
    expect(deleted.flat()).not.toContain(expect.stringContaining("/temp/"));
  });
});
