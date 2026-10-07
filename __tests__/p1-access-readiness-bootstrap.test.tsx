import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { eq } from "drizzle-orm";
import * as React from "react";
import { Alert } from "react-native";

import PrivacyScreen from "../src/app/privacy";
import { DELETE as deleteAccount } from "../src/app/api/account+api";
import { POST as requestDeletionChallenge } from "../src/app/api/account/deletion-challenge+api";
import { POST as logout } from "../src/app/api/auth/logout+api";
import { GET as getCurrentAccount } from "../src/app/api/auth/me+api";
import { POST as verifyAccount } from "../src/app/api/auth/verify+api";
import { POST as editorManagement } from "../src/app/api/gifts/invited/[id]/management-requests+api";
import { GET as readOwnedAlbum } from "../src/app/api/my-gifts/[id]/album+api";
import { AuthProvider, useAuth } from "../src/features/auth/auth-provider";
import { accountLocalLibraryOwner } from "../src/features/auth/local-library-owner";
import { BackendApiClient, type AuthenticatedAccountSession } from "../src/services/backend/api-client";
import { hashAccessToken } from "../src/server/auth/device-auth";
import { createAuthEmailCode, createAuthSession, createOrGetUserByEmail, getAuthenticatedUserByTokenHash } from "../src/server/auth/repository";
import { accountDeletionJobs, authSessions, users } from "../src/server/db/schema";
import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";
import { addGiftMember, claimGiftByTokenHash, createGift } from "../src/server/gifts/repository";

let mockCurrentDb: ReturnType<typeof createBackendTestDatabase>["db"];
let mockSavedSession: AuthenticatedAccountSession | null;
let capturedAuth: ReturnType<typeof useAuth> | undefined;
const mockClearAuthSession = jest.fn(async () => { mockSavedSession = null; });
const mockDeleteAccountLibrary = jest.fn(async () => undefined);
const mockSendDeletionCode = jest.fn(async (_input: { code: string }) => undefined);
const mockPush = jest.fn();
const mockResponses: { path: string; status: number }[] = [];

jest.mock("../src/server/db/client", () => ({
  ...jest.requireActual("../src/server/db/client"), getServerDatabase: () => mockCurrentDb,
}));
jest.mock("../src/features/auth/auth-storage", () => ({
  loadAuthSession: async () => mockSavedSession,
  loadRememberedEmail: async () => mockSavedSession?.user.email ?? null,
  clearAuthSession: () => mockClearAuthSession(),
  saveAuthSession: async (session: AuthenticatedAccountSession) => { mockSavedSession = session; },
  saveRememberedEmail: jest.fn(), clearRememberedEmail: jest.fn(),
}));
jest.mock("../src/features/auth/privacy-local-library", () => ({
  usePrivacyLocalLibrary: () => ({
    accountLibraryKey: mockSavedSession ? `account:${mockSavedSession.user.email}` : null,
    currentLibraryIsGuest: false, deleteAccountLibrary: mockDeleteAccountLibrary, isLibraryReady: true,
  }),
}));
jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({ clearAllMemories: jest.fn() }),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../src/server/gifts/r2-media", () => ({ getR2MediaStoreFromEnvironment: () => null }));
jest.mock("../src/server/gifts/resend-email-sender", () => ({
  sendAccountDeletionVerificationEmail: (input: { code: string }) => mockSendDeletionCode(input),
}));

const syntheticPepper = "local-bootstrap-regression-only";
const giftId = "bootstrap-gift";
const actors = {
  owner: { email: "owner@example.test", token: "bootstrap-owner-token", sessionId: "bootstrap-owner-session" },
  editor: { email: "editor@example.test", token: "bootstrap-editor-token", sessionId: "bootstrap-editor-session" },
} as const;

function CaptureAuth() { capturedAuth = useAuth(); return null; }

// The real API client and provider consume real local route responses. An unmatched
// network request fails rather than reaching a remote service.
async function localFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const path = new URL(request.url).pathname;
  let response: Response;
  if (path === "/api/auth/me") response = await getCurrentAccount(request);
  else if (path === "/api/auth/verify") response = await verifyAccount(request);
  else if (path === "/api/auth/logout") response = await logout(request);
  else if (path === "/api/account/deletion-challenge") response = await requestDeletionChallenge(request);
  else if (path === "/api/account") response = await deleteAccount(request);
  else throw new Error(`Unexpected local regression request: ${path}`);
  mockResponses.push({ path, status: response.status });
  return response;
}

function accountRequest(actor: keyof typeof actors, method: string, body?: unknown) {
  return new Request("https://local.test/api/gifts", {
    method, headers: { Authorization: `Bearer ${actors[actor].token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function restoreSavedAccount(actor: keyof typeof actors) {
  const [user] = await mockCurrentDb.select().from(users).where(eq(users.email, actors[actor].email));
  mockSavedSession = { accessToken: actors[actor].token, user: { id: user.id, email: user.email, isAdmin: false } };
  const expected = mockSavedSession;
  const screen = render(<AuthProvider><CaptureAuth /><PrivacyScreen /></AuthProvider>);
  await waitFor(() => expect(capturedAuth?.isAuthReady).toBe(true));
  return { expected, screen };
}

describe("P1 account restoration remains independent of gift eligibility", () => {
  let close: () => Promise<void>;
  const environmentKeys = ["GIFT_AUTH_PEPPER", "ALPHA_ALLOWED_EMAILS", "GIFT_SHARING_ENABLED", "RESEND_API_KEY", "GIFT_EMAIL_FROM"];
  const originalEnvironment = Object.fromEntries(environmentKeys.map(name => [name, process.env[name]]));

  beforeEach(async () => {
    jest.clearAllMocks();
    capturedAuth = undefined; mockSavedSession = null; mockResponses.length = 0;
    jest.spyOn(console, "info").mockImplementation(() => undefined);
    jest.spyOn(globalThis, "fetch").mockImplementation(localFetch);
    const database = createBackendTestDatabase(); mockCurrentDb = database.db; close = database.close;
    await migrateBackendDatabase(mockCurrentDb);
    process.env.GIFT_AUTH_PEPPER = syntheticPepper;
    process.env.ALPHA_ALLOWED_EMAILS = Object.values(actors).map(actor => actor.email).join(",");
    process.env.GIFT_SHARING_ENABLED = "true";
    process.env.RESEND_API_KEY = "synthetic-test-only";
    process.env.GIFT_EMAIL_FROM = "support@example.test";
    const now = new Date().toISOString();
    for (const actor of Object.values(actors)) {
      const user = await createOrGetUserByEmail(mockCurrentDb, actor.email, now);
      await createAuthSession(mockCurrentDb, {
        id: actor.sessionId, userId: user.id, tokenHash: await hashAccessToken(actor.token, syntheticPepper),
        createdAt: now, expiresAt: new Date(Date.now() + 600_000).toISOString(),
      });
    }
    await createGift(mockCurrentDb, { id: giftId, tokenHash: "bootstrap-gift-hash", createdAt: now });
    await claimGiftByTokenHash(mockCurrentDb, "bootstrap-gift-hash", actors.owner.email, now);
    await addGiftMember(mockCurrentDb, giftId, actors.editor.email, now, "editor");
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    await close();
  });

  it.each(["owner", "editor"] as const)("restores a removed %s and permits account deletion after restart during a sharing pause", async actor => {
    process.env.ALPHA_ALLOWED_EMAILS = "another@example.test";
    process.env.GIFT_SHARING_ENABLED = "false";
    const { expected, screen } = await restoreSavedAccount(actor);
    expect(capturedAuth?.session).toEqual(expected);
    expect(mockClearAuthSession).not.toHaveBeenCalled();
    expect(mockResponses).toContainEqual({ path: "/api/auth/me", status: 200 });
    expect(screen.getByText("永久删除账号及云端数据")).toBeTruthy();

    // Identity restoration must not reopen either owner or editor business access.
    process.env.GIFT_SHARING_ENABLED = "true";
    const businessResponse = actor === "owner"
      ? await readOwnedAlbum(accountRequest(actor, "GET"), { id: giftId })
      : await editorManagement(accountRequest(actor, "POST", { action: "delete_album" }), { id: giftId });
    expect(businessResponse.status).toBe(403);
    await expect(businessResponse.json()).resolves.toEqual(expect.objectContaining({
      error: expect.objectContaining({ code: "beta_invite_required" }),
    }));
    process.env.GIFT_SHARING_ENABLED = "false";

    fireEvent.press(screen.getByText("永久删除账号及云端数据"));
    await waitFor(() => expect(screen.getByLabelText("账号删除验证码")).toBeTruthy());
    expect(mockResponses).toContainEqual({ path: "/api/account/deletion-challenge", status: 200 });
    fireEvent.changeText(screen.getByLabelText("账号删除验证码"), mockSendDeletionCode.mock.calls[0][0].code);
    fireEvent.changeText(screen.getByLabelText("账号删除确认文字"), "DELETE");
    // Keep completion in one React batch to reproduce the receipt being committed
    // before the effect caused by this deletion's own sign-out runs.
    const receiptAnnounced = new Promise<void>(resolve => {
      jest.spyOn(Alert, "alert").mockImplementation(title => { if (title === "账号删除已受理") resolve(); });
    });
    await act(async () => {
      fireEvent.press(screen.getByText("确认永久删除"));
      await receiptAnnounced;
    });
    expect(screen.getByText(/账号删除已受理：/u)).toBeTruthy();
    expect(mockResponses).toContainEqual({ path: "/api/account", status: 202 });
    expect(mockResponses).toContainEqual({ path: "/api/auth/logout", status: 204 });
    const [job] = await mockCurrentDb.select().from(accountDeletionJobs);
    expect(job.state).toBe("pending");
    expect(capturedAuth?.session).toBeNull();
    expect(mockDeleteAccountLibrary).toHaveBeenCalledWith(accountLocalLibraryOwner(actors[actor].email));
    expect(await getAuthenticatedUserByTokenHash(mockCurrentDb, await hashAccessToken(actors[actor].token, syntheticPepper), new Date().toISOString())).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();

    // A new account generation must never retain the previous account's receipt.
    const nextActor = actor === "owner" ? "editor" : "owner";
    const deletionGeneration = capturedAuth!.sessionGeneration;
    process.env.GIFT_SHARING_ENABLED = "true";
    process.env.ALPHA_ALLOWED_EMAILS = actors[nextActor].email;
    await createAuthEmailCode(mockCurrentDb, {
      id: "next-account-code", email: actors[nextActor].email,
      codeHash: await hashAccessToken("654321", syntheticPepper), createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
    await act(async () => { await capturedAuth!.verifyCode(actors[nextActor].email, "654321"); });
    expect(capturedAuth?.user?.email).toBe(actors[nextActor].email);
    expect(capturedAuth!.sessionGeneration).toBeGreaterThan(deletionGeneration);
    expect(screen.queryByText(/账号删除已受理：/u)).toBeNull();
    expect(screen.getByText("永久删除账号及云端数据")).toBeTruthy();
  }, 15_000);

  it.each(["expired", "forged", "revoked", "deletion-pending"] as const)("rejects a %s saved session through the real me response", async state => {
    if (state === "expired") await mockCurrentDb.update(authSessions).set({ expiresAt: new Date(Date.now() - 1_000).toISOString() }).where(eq(authSessions.id, actors.owner.sessionId));
    if (state === "revoked") await mockCurrentDb.update(authSessions).set({ revokedAt: new Date().toISOString() }).where(eq(authSessions.id, actors.owner.sessionId));
    if (state === "deletion-pending") await mockCurrentDb.update(users).set({ deletionState: "pending", deletionRequestedAt: new Date().toISOString() }).where(eq(users.email, actors.owner.email));
    const [user] = await mockCurrentDb.select().from(users).where(eq(users.email, actors.owner.email));
    mockSavedSession = { accessToken: state === "forged" ? "forged-token" : actors.owner.token, user: { id: user.id, email: user.email, isAdmin: false } };
    const screen = render(<AuthProvider><CaptureAuth /><PrivacyScreen /></AuthProvider>);
    await waitFor(() => expect(capturedAuth?.isAuthReady).toBe(true));
    expect(capturedAuth?.session).toBeNull();
    expect(mockClearAuthSession).toHaveBeenCalledTimes(1);
    expect(mockResponses).toEqual([{ path: "/api/auth/me", status: 401 }]);
    expect(screen.queryByText("永久删除账号及云端数据")).toBeNull();
    expect(screen.getByText("登录管理账号")).toBeTruthy();
  });

  it("lets a restored removed account explicitly log out during a sharing pause", async () => {
    process.env.ALPHA_ALLOWED_EMAILS = actors.editor.email;
    process.env.GIFT_SHARING_ENABLED = "false";
    const { expected } = await restoreSavedAccount("owner");
    expect(capturedAuth?.session).toEqual(expected);
    await act(async () => { await capturedAuth!.signOut(); });
    expect(capturedAuth?.session).toBeNull();
    expect(mockResponses).toContainEqual({ path: "/api/auth/logout", status: 204 });
    expect(await getAuthenticatedUserByTokenHash(mockCurrentDb, await hashAccessToken(actors.owner.token, syntheticPepper), new Date().toISOString())).toBeNull();
  });

  it("returns only the public identity contract from the session boundary", async () => {
    const response = await getCurrentAccount(accountRequest("owner", "GET"));
    expect(response.status).toBe(200);
    const [user] = await mockCurrentDb.select().from(users).where(eq(users.email, actors.owner.email));
    await expect(response.json()).resolves.toEqual({ user: { id: user.id, email: user.email, isAdmin: false } });
    const client = new BackendApiClient(localFetch, "https://local.test");
    await expect(client.getCurrentAuthUser("forged-token")).rejects.toMatchObject({ status: 401, code: "unauthorized" });
  });
});
