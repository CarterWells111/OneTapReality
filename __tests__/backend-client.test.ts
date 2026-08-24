import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BackendApiClient,
  BackendApiError,
  resolveBackendRequestUrl,
} from "../src/services/backend/api-client";

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

  it("keeps development requests relative when no origin is configured", () => {
    expect(resolveBackendRequestUrl("/api/health", undefined)).toBe("/api/health");
  });

  it("authenticates an account and reads the current server-derived role", async () => {
    const request = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ email: "owner@example.com" }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: "account-token", user: { id: "user-1", email: "owner@example.com", isAdmin: false } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: "user-1", email: "owner@example.com", isAdmin: false } }), { status: 200 }));
    const client = new BackendApiClient(request);

    await expect(client.requestAuthEmailCode("owner@example.com")).resolves.toEqual({ email: "owner@example.com" });
    await expect(client.verifyAuthEmailCode("owner@example.com", "123456")).resolves.toEqual(expect.objectContaining({ accessToken: "account-token" }));
    await expect(client.getCurrentAuthUser("account-token")).resolves.toEqual({ id: "user-1", email: "owner@example.com", isAdmin: false });
    expect(request.mock.calls.map(([url]) => url)).toEqual(["/api/auth/request", "/api/auth/verify", "/api/auth/me"]);
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
    const client = new BackendApiClient(request);

    await expect(client.getOwnedGiftManagement("session", "gift-1")).resolves.toEqual(expect.objectContaining({ gift: expect.objectContaining({ id: "gift-1" }) }));
    expect(request).toHaveBeenCalledWith("/api/my-gifts/gift-1/manage", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer session" }) }));
  });

  it("lists invited gifts and reads an invited album from the real endpoints", async () => {
    const request = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ giftId: "gift-1", role: "viewer", album: { title: "A shared trip", travelDate: "2026-07-24", albumId: "album-1", publishedAt: "2026-07-24T00:00:00.000Z", version: 1, cover: { readUrl: "https://cdn.test/cover.jpg", contentType: "image/jpeg", byteSize: 24 } } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "A shared trip", travelDate: null, pages: [], media: [], publishedAt: "2026-07-24T00:00:00.000Z", version: 1, cover: null }), { status: 200 }));
    const client = new BackendApiClient(request);

    await expect(client.listInvitedGifts("session")).resolves.toEqual([
      expect.objectContaining({ giftId: "gift-1", album: expect.objectContaining({ travelDate: "2026-07-24", cover: expect.objectContaining({ readUrl: "https://cdn.test/cover.jpg" }) }) }),
    ]);
    await expect(client.getInvitedGiftAlbum("gift-1", "session")).resolves.toEqual(expect.objectContaining({ title: "A shared trip", travelDate: null, cover: null }));
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      "/api/gifts/invited",
      "/api/gifts/invited/gift-1/album",
    ]);
  });

  it("serializes the shared album title and travel date for every publish endpoint", async () => {
    const request = jest.fn().mockResolvedValue(new Response(JSON.stringify({ publicationId: "publish-1", uploads: [], coverUpload: null, expiresAt: "2026-07-24T00:10:00.000Z" }), { status: 201 }));
    const client = new BackendApiClient(request);
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
