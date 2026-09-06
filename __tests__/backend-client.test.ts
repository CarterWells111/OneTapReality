import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BackendApiClient,
  BackendApiError,
  isBackendSessionInvalidError,
  resolveBackendRequestUrl,
} from "../src/services/backend/api-client";

jest.mock("../src/config/build-environment", () => ({
  getBuildEnvironment: () => ({ apiOrigin: "https://api-staging.onetapreality.com" }),
}));

describe("backend client", () => {
  afterEach(() => jest.restoreAllMocks());

  it("parses a health response", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ service: "onetapreality-api", contractVersion: 1, database: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(new BackendApiClient().getHealth()).resolves.toEqual(
      expect.objectContaining({ service: "onetapreality-api", database: "ok" }),
    );
  });

  it("turns a non-success response into a typed error", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "unauthorized", message: "No token" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(new BackendApiClient().getHealth()).rejects.toEqual(
      expect.objectContaining<Partial<BackendApiError>>({ status: 401, code: "unauthorized" }),
    );
  });

  it("uses an explicit production origin without a trailing slash", () => {
    expect(resolveBackendRequestUrl("/api/health", "https://example.up.railway.app/"))
      .toBe("https://example.up.railway.app/api/health");
  });

  it("uses the validated runtime API origin by default", () => {
    expect(resolveBackendRequestUrl("/api/health"))
      .toBe("https://api-staging.onetapreality.com/api/health");
  });

  it("allows an injected relative transport without guessing an environment", () => {
    expect(resolveBackendRequestUrl("/api/health", "")).toBe("/api/health");
  });

  it("authenticates an account and reads the current server-derived role", async () => {
    const request = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ email: "owner@example.com" }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: "account-token", user: { id: "user-1", email: "owner@example.com", isAdmin: false } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: "user-1", email: "owner@example.com", isAdmin: false } }), { status: 200 }));
    const client = new BackendApiClient(request, "");

    await expect(client.requestAuthEmailCode("owner@example.com")).resolves.toEqual({ email: "owner@example.com" });
    await expect(client.verifyAuthEmailCode("owner@example.com", "123456")).resolves.toEqual(expect.objectContaining({ accessToken: "account-token" }));
    await expect(client.getCurrentAuthUser("account-token")).resolves.toEqual({ id: "user-1", email: "owner@example.com", isAdmin: false });
    expect(request.mock.calls.map(([url]) => url)).toEqual(["/api/auth/request", "/api/auth/verify", "/api/auth/me"]);
  });

  it("does not classify a wrong deletion code as an expired account session", () => {
    expect(isBackendSessionInvalidError(new BackendApiError(401, "invalid_deletion_code", "Wrong code"))).toBe(false);
    expect(isBackendSessionInvalidError(new BackendApiError(401, "unauthorized", "Expired"))).toBe(true);
  });

  it("requests and confirms permanent account deletion with the bearer session", async () => {
    const request = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ challengeId: "challenge-1", expiresAt: "2026-08-24T10:05:00.000Z" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ receiptId: "receipt-1", completeBy: "2026-08-25T10:00:00.000Z" }), { status: 202 }));
    const client = new BackendApiClient(request, "");

    await expect(client.requestAccountDeletionChallenge("session")).resolves.toEqual({ challengeId: "challenge-1", expiresAt: "2026-08-24T10:05:00.000Z" });
    await expect(client.deleteAccount("session", { challengeId: "challenge-1", code: "123456", confirmation: "DELETE" }))
      .resolves.toEqual({ receiptId: "receipt-1", completeBy: "2026-08-25T10:00:00.000Z" });
    expect(request).toHaveBeenNthCalledWith(1, "/api/account/deletion-challenge", expect.objectContaining({ method: "POST", headers: { Authorization: "Bearer session" } }));
    expect(request).toHaveBeenNthCalledWith(2, "/api/account", expect.objectContaining({
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: "Bearer session" },
      body: JSON.stringify({ challengeId: "challenge-1", code: "123456", confirmation: "DELETE" }),
    }));
  });

  it("keeps all admin gift-card contracts and endpoints out of the public client", () => {
    const source = readFileSync(
      join(process.cwd(), "src/services/backend/api-client.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/AdminGiftCard|\/api\/admin\/gift-cards/u);
    expect(source).not.toMatch(
      /reserveGiftCard|listAdminGiftCards|getAdminGiftCard|activateAdminGiftCard|retireAdminGiftCard/u,
    );
  });

  it("uses internal gift ids for owner management rather than NFC tokens", async () => {
    const request = jest.fn().mockResolvedValue(new Response(JSON.stringify({ gift: { id: "gift-1", status: "bound" }, members: [], album: null }), { status: 200 }));
    const client = new BackendApiClient(request, "");

    await expect(client.getOwnedGiftManagement("session", "gift-1")).resolves.toEqual(expect.objectContaining({ gift: expect.objectContaining({ id: "gift-1" }) }));
    expect(request).toHaveBeenCalledWith("/api/my-gifts/gift-1/manage", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer session" }) }));
  });

  it("refreshes upload URLs with only the publication selection", async () => {
    const request = jest.fn().mockResolvedValue(new Response(JSON.stringify({ uploads: [], coverUpload: null }), { status: 200 }));
    const client = new BackendApiClient(request);
    const selection = { publicationId: "publication-1", positions: [1, 3], cover: true };

    await client.refreshOwnedGiftPublishUploads("session", "gift-1", selection);
    await client.refreshInvitedGiftPublishUploads("gift-1", "session", selection);
    await client.refreshGiftPublishUploads("token", "session", selection);

    expect(request.mock.calls.map(([url, init]) => [url, init.method, JSON.parse(init.body as string)])).toEqual([
      ["https://api-staging.onetapreality.com/api/my-gifts/gift-1/publish", "PATCH", selection],
      ["https://api-staging.onetapreality.com/api/gifts/invited/gift-1/publish", "PATCH", selection],
      ["https://api-staging.onetapreality.com/api/gifts/token/publish", "PATCH", selection],
    ]);
  });

  it("lists invited gifts and reads an invited album from the real endpoints", async () => {
    const request = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ giftId: "gift-1", role: "viewer", album: { title: "A shared trip", travelDate: "2026-07-24", albumId: "album-1", publishedAt: "2026-07-24T00:00:00.000Z", version: 1, cover: { readUrl: "https://cdn.test/cover.jpg", contentType: "image/jpeg", byteSize: 24 } } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "A shared trip", travelDate: null, pages: [], media: [], publishedAt: "2026-07-24T00:00:00.000Z", version: 1, cover: null }), { status: 200 }));
    const client = new BackendApiClient(request, "");

    await expect(client.listInvitedGifts("session")).resolves.toEqual([
      expect.objectContaining({ giftId: "gift-1", album: expect.objectContaining({ travelDate: "2026-07-24", cover: expect.objectContaining({ readUrl: "https://cdn.test/cover.jpg" }) }) }),
    ]);
    await expect(client.getInvitedGiftAlbum("gift-1", "session")).resolves.toEqual(expect.objectContaining({ title: "A shared trip", travelDate: null, cover: null }));
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      "/api/gifts/invited",
      "/api/gifts/invited/gift-1/album",
    ]);
  });

  it("uses authenticated internal gift-id endpoints for report, block and leave", async () => {
    const request = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "created", report: { id: "report-1", snapshotVersion: 4 } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "created", block: { id: "block-1" } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new BackendApiClient(request, "");

    await expect(client.reportGiftContent("gift-1", "session", "harassment", "说明")).resolves.toEqual({ status: "created", report: { id: "report-1", snapshotVersion: 4 } });
    await expect(client.blockGiftUser("gift-1", "session", { targetEmail: "owner@example.com" })).resolves.toEqual({ status: "created", block: { id: "block-1" } });
    await expect(client.leaveGiftMembership("gift-1", "session")).resolves.toBeUndefined();

    expect(request).toHaveBeenNthCalledWith(1, "/api/gifts/gift-1/reports", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer session" },
      body: JSON.stringify({ reason: "harassment", details: "说明" }),
    }));
    expect(request).toHaveBeenNthCalledWith(2, "/api/gifts/gift-1/blocks", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ targetEmail: "owner@example.com" }),
    }));
    expect(request).toHaveBeenNthCalledWith(3, "/api/gifts/gift-1/membership", expect.objectContaining({ method: "DELETE" }));
  });

  it("serializes the shared album title and travel date for every publish endpoint", async () => {
    const request = jest.fn().mockResolvedValue(new Response(JSON.stringify({ publicationId: "publish-1", uploads: [], coverUpload: null, expiresAt: "2026-07-24T00:10:00.000Z" }), { status: 201 }));
    const client = new BackendApiClient(request, "");
    const payload = { baseVersion: 0, sourceMemoryId: "memory-1", title: "A shared trip", travelDate: "2026-07-24", pages: [], media: [] };

    await client.startGiftPublish("tag", "session", payload);
    await client.startOwnedGiftPublish("session", "gift-1", payload);
    await client.startInvitedGiftPublish("gift-1", "session", { ...payload, travelDate: null });

    expect(request.mock.calls.map(([, options]) => JSON.parse(String(options?.body)))).toEqual([
      expect.objectContaining({ title: "A shared trip", travelDate: "2026-07-24" }),
      expect.objectContaining({ title: "A shared trip", travelDate: "2026-07-24" }),
      expect.objectContaining({ title: "A shared trip", travelDate: null }),
    ]);
  });
});
