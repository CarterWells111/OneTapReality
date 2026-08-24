import { ApiError } from "../src/server/http/errors";
import { prepareSharedPublication, promoteSharedPublication, verifySharedPublication } from "../src/server/gifts/shared-publication";

const mockRequireAccount = jest.fn(async (..._args: unknown[]) => ({ id: "editor-user", email: "editor@example.com" }));
const mockGetAccess = jest.fn(async (..._args: unknown[]): Promise<any> => ({ memberId: "member-1", id: "gift-1", status: "bound", role: "editor", albumId: "album-1", version: 1 }));
const mockCreateSession = jest.fn(async (..._args: unknown[]) => undefined);
const mockGetPayload = jest.fn(async (..._args: unknown[]): Promise<any> => ({ sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ position: 0, objectKey: "gifts/gift-1/session/photo", contentType: "image/jpeg", byteSize: 12 }], cover: null }));
const mockCompleteSession = jest.fn(async (..._args: unknown[]): Promise<any> => ({ albumId: "album-1", oldObjectKeys: [] }));
const mockMetadata = jest.fn(async (..._args: unknown[]): Promise<any> => ({ contentType: "image/jpeg", byteSize: 12 }));
const mockResolveExisting = jest.fn(async (..._args: unknown[]): Promise<any> => [{ position: 0, objectKey: "gifts/gift-1/old/photo", contentType: "image/jpeg", byteSize: 9 }]);
const mockDeleteObjects = jest.fn(async (..._args: unknown[]) => undefined);
const mockCopyObject = jest.fn(async (..._args: unknown[]) => undefined);
const mockEnqueueCleanup = jest.fn(async (..._args: unknown[]) => undefined);

jest.mock("../src/server/db/client", () => ({ getServerDatabase: jest.fn(() => ({})) }));
jest.mock("../src/server/gifts/owner-access", () => ({ requireOwnedGift: jest.fn(async () => ({ db: {}, email: "owner@example.com", gift: { id: "gift-1", status: "bound" } })) }));
jest.mock("../src/server/gifts/session-auth", () => ({ requireGiftSessionEmail: jest.fn(async () => "owner@example.com"), hashGiftToken: jest.fn(async () => "hash") }));
jest.mock("../src/server/auth/session-auth", () => ({ requireAuthenticatedAccount: (...args: unknown[]) => mockRequireAccount(...args) }));
jest.mock("../src/server/gifts/member-access", () => ({ getActivatedGiftMemberAccess: (...args: unknown[]) => mockGetAccess(...args) }));
jest.mock("../src/server/gifts/r2-media", () => ({ getR2MediaStoreFromEnvironment: jest.fn(() => ({ createUploadUrl: jest.fn(async () => "https://upload.test"), getObjectMetadata: (...args: unknown[]) => mockMetadata(...args), copyObject: (...args: unknown[]) => mockCopyObject(...args), deleteObjects: (...args: unknown[]) => mockDeleteObjects(...args) })) }));
jest.mock("../src/server/gifts/repository", () => {
  class Conflict extends Error { code = "gift_album_version_conflict"; }
  class Unavailable extends Error { code = "gift_publication_unavailable"; }
  return {
    GiftAlbumVersionConflictError: Conflict,
    GiftPublicationUnavailableError: Unavailable,
    createGiftPublishSession: (...args: unknown[]) => mockCreateSession(...args),
    getGiftPublishPayload: (...args: unknown[]) => mockGetPayload(...args),
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
import { POST, PUT } from "../src/app/api/gifts/invited/[id]/publish+api";
import { POST as ownedPOST } from "../src/app/api/my-gifts/[id]/publish+api";
import { POST as tokenPOST } from "../src/app/api/gifts/[token]/publish+api";

describe("editor shared publication contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GIFT_SHARING_ENABLED = "true";
    mockGetAccess.mockResolvedValue({ memberId: "member-1", id: "gift-1", status: "bound", role: "editor", albumId: "album-1", version: 1 });
    mockGetPayload.mockResolvedValue({ sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ position: 0, objectKey: "gifts/gift-1/session/photo", contentType: "image/jpeg", byteSize: 12 }], cover: null });
    mockCompleteSession.mockResolvedValue({ albumId: "album-1", oldObjectKeys: [] });
    mockMetadata.mockResolvedValue({ contentType: "image/jpeg", byteSize: 12 });
    mockResolveExisting.mockResolvedValue([{ position: 0, objectKey: "gifts/gift-1/old/photo", contentType: "image/jpeg", byteSize: 9 }]);
    mockDeleteObjects.mockResolvedValue(undefined);
    mockCopyObject.mockResolvedValue(undefined);
    mockEnqueueCleanup.mockResolvedValue(undefined);
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
    mockGetPayload.mockResolvedValueOnce({ sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ position: 0, objectKey: "gifts/gift-1/session/temp/photo", contentType: "image/jpeg", byteSize: 12, source: "upload" }], cover: null });
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
    mockGetPayload.mockResolvedValueOnce({ sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ position: 0, objectKey: "gifts/gift-1/session/temp/photo", contentType: "image/jpeg", byteSize: 12, source: "upload" }], cover: null });
    mockCopyObject.mockRejectedValueOnce(new Error("R2 copy failed"));

    const response = await PUT(request("PUT", { publicationId: "session-1" }), { id: "gift-1" });

    expect(response.status).toBe(500);
    expect(mockCompleteSession).not.toHaveBeenCalled();
    expect(mockEnqueueCleanup).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      giftId: "gift-1", sessionId: "session-1", ownerEmail: "editor@example.com",
      objectKeys: [expect.stringContaining("/final/")], now: expect.any(String),
    }));
    expect(mockEnqueueCleanup.mock.invocationCallOrder[0]).toBeLessThan(mockCopyObject.mock.invocationCallOrder[0]);
  });

  it("does not write any R2 final when candidate pre-registration fails", async () => {
    mockGetPayload.mockResolvedValueOnce({ sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ position: 0, objectKey: "gifts/gift-1/session/temp/photo", contentType: "image/jpeg", byteSize: 12, source: "upload" }], cover: null });
    mockEnqueueCleanup.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await PUT(request("PUT", { publicationId: "session-1" }), { id: "gift-1" });

    expect(response.status).toBe(500);
    expect(mockCopyObject).not.toHaveBeenCalled();
    expect(mockCompleteSession).not.toHaveBeenCalled();
  });

  it("isolates concurrent finalization attempts so the losing editor cannot delete the winner's R2 object", async () => {
    const tempKey = "gifts/gift-1/session-1/temp/photo";
    mockGetPayload.mockImplementation(async () => ({ sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ position: 0, objectKey: tempKey, contentType: "image/jpeg", byteSize: 12, source: "upload" }], cover: null }));
    const completedPayloads: string[] = [];
    mockCompleteSession.mockImplementation(async (...args: unknown[]) => {
      const input = args[1] as { payload?: { media: { objectKey: string }[] } };
      const finalKey = input.payload?.media[0].objectKey;
      if (finalKey) completedPayloads.push(finalKey);
      return completedPayloads.length === 1 ? { albumId: "album-1", oldObjectKeys: [] } : null;
    });

    const responses = await Promise.all([
      PUT(request("PUT", { publicationId: "session-1" }), { id: "gift-1" }),
      PUT(request("PUT", { publicationId: "session-1" }), { id: "gift-1" }),
    ]);

    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    expect(completedPayloads).toHaveLength(2);
    expect(new Set(completedPayloads).size).toBe(2);
    expect(completedPayloads.every(key => key.includes("/final/"))).toBe(true);
    expect(mockDeleteObjects).toHaveBeenCalledWith([completedPayloads[1]]);
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

  it.each(["copy", "head"] as const)("best-effort removes attempted final objects when %s promotion fails", async (stage) => {
    const payload = prepareSharedPublication({ baseVersion: 0, sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ contentType: "image/jpeg", byteSize: 12 }] }, "gift-1", "session-1").payload;
    const deleted: string[][] = [];
    const store = {
      copyObject: jest.fn(async () => { if (stage === "copy") throw new Error("copy failed"); }),
      getObjectMetadata: jest.fn(async () => { if (stage === "head") throw new Error("head failed"); return { contentType: "image/jpeg", byteSize: 12 }; }),
      deleteObjects: jest.fn(async (keys: string[]) => { deleted.push(keys); }),
    };
    await expect(promoteSharedPublication(store as never, payload)).rejects.toThrow();
    expect(deleted.at(-1)).toEqual([expect.stringContaining("/final/")]);
  });

  it("aborts and rejects a copy that does not settle within the promotion deadline", async () => {
    jest.useFakeTimers();
    try {
      const payload = prepareSharedPublication({ baseVersion: 0, sourceMemoryId: "memory", title: "Trip", pages: [], media: [{ contentType: "image/jpeg", byteSize: 12 }] }, "gift-1", "session-1").payload;
      let copySignal: AbortSignal | undefined;
      const store = {
        copyObject: jest.fn((_source: string, _destination: string, options?: { abortSignal?: AbortSignal }) => {
          copySignal = options?.abortSignal;
          return new Promise<void>(() => undefined);
        }),
        getObjectMetadata: jest.fn(async () => ({ contentType: "image/jpeg", byteSize: 12 })),
        deleteObjects: jest.fn(async () => undefined),
      };

      const promotion = promoteSharedPublication(store as never, payload);
      const rejected = expect(promotion).rejects.toThrow("Promotion time budget exceeded");
      await jest.advanceTimersByTimeAsync(15_000);

      await rejected;
      expect(copySignal?.aborted).toBe(true);
      expect(store.deleteObjects).toHaveBeenCalledWith(
        [expect.stringContaining("/final/")],
        expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("uses server-owned attempt keys and leaves temp objects available for concurrent promotion", async () => {
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

    expect(firstFinals[0]).not.toBe(secondFinals[0]);
    expect(firstFinals[0]).toMatch(/\/final\/[^/]+\//u);
    expect(secondFinals[0]).toMatch(/\/final\/[^/]+\//u);
    expect(deleted.flat()).not.toContain(expect.stringContaining("/temp/"));
  });
});
