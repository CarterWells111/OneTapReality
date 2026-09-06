import type {
  BackendErrorBody,
  CapabilitiesResponse,
  CloudMemory,
  CloudMemoryPayload,
  DeviceRegistrationResponse,
  HealthResponse,
} from "./contracts";
import { getBuildEnvironment } from "../../config/build-environment";

export type AuthenticatedAccountUser = { id: string; email: string; isAdmin: boolean };
export type AuthenticatedAccountSession = { accessToken: string; user: AuthenticatedAccountUser };
export type AccountDeletionChallenge = { challengeId: string; expiresAt: string };
export type AccountDeletionReceipt = { receiptId: string; completeBy: string };
export type GiftMemberRole = "owner" | "viewer" | "editor";
export type GiftContentReportReason = "sexual" | "harassment" | "hate" | "violence" | "spam" | "other";
export type GiftManagementAction = "delete_album" | "remove_member" | "change_member_role";
export type GiftManagementRequest = { id: string; action: GiftManagementAction; targetEmail: string | null; targetRole: "viewer" | "editor" | null; status: "pending" | "approved" | "rejected"; createdAt: string; decidedAt: string | null };
export type RefreshPublicationUploadsSelection = { publicationId: string; positions: number[]; cover: boolean };
export type RefreshedPublicationUploads = {
  uploads: { position: number; uploadUrl: string }[];
  coverUpload: { uploadUrl: string } | null;
};

export type SharedAlbumPublishPayload = {
  baseVersion: number;
  sourceMemoryId: string;
  title: string;
  travelDate: string | null;
  pages: { position: number; page: unknown }[];
  media: ({ position: number; mediaId: string } | { position: number; contentType: string; byteSize: number })[];
  cover?: { contentType: string; byteSize: number } | null;
};

export type InvitedGift = {
  giftId: string;
  role: "viewer" | "editor";
  album: {
    title: string;
    travelDate: string | null;
    albumId: string;
    publishedAt: string;
    version: number;
    cover: SharedAlbumCover | null;
  } | null;
};

export type SharedAlbumCover = {
  readUrl: string;
  contentType: string;
  byteSize: number;
};

export type InvitedGiftAlbum = {
  role: GiftMemberRole;
  title: string;
  travelDate: string | null;
  pages: { position: number; page: unknown }[];
  media: { id: string; position: number; contentType: string; byteSize: number; readUrl: string }[];
  publishedAt: string;
  version: number;
  cover: SharedAlbumCover | null;
};

export class BackendApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BackendApiError";
  }
}

export function isBackendSessionInvalidError(error: unknown): boolean {
  return error instanceof BackendApiError && error.status === 401 && error.code === "unauthorized";
}
export function resolveBackendRequestUrl(
  path: string,
  origin = getBuildEnvironment().apiOrigin,
): string {
  const normalizedOrigin = origin?.replace(/\/+$/u, "");
  return normalizedOrigin ? `${normalizedOrigin}${path}` : path;
}

export class BackendApiClient {
  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly origin = getBuildEnvironment().apiOrigin,
  ) {}

  protected async send<T>(path: string, options?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.request(resolveBackendRequestUrl(path, this.origin), options);
    } catch {
      throw new BackendApiError(0, "network_unavailable", "Network unavailable");
    }

    const body = await response.json().catch(() => null) as T | BackendErrorBody | null;
    if (!response.ok) {
      const error = body && typeof body === "object" && "error" in body ? body.error : undefined;
      throw new BackendApiError(response.status, error?.code ?? "request_failed", error?.message ?? "Request failed");
    }
    return body as T;
  }

  getHealth(): Promise<HealthResponse> {
    return this.send<HealthResponse>("/api/health");
  }

  getCapabilities(): Promise<CapabilitiesResponse> {
    return this.send<CapabilitiesResponse>("/api/capabilities");
  }

  requestAuthEmailCode(email: string): Promise<{ email: string }> {
    return this.send("/api/auth/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
  }

  verifyAuthEmailCode(email: string, code: string): Promise<AuthenticatedAccountSession> {
    return this.send("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code }) });
  }

  getCurrentAuthUser(accessToken: string): Promise<AuthenticatedAccountUser> {
    return this.send<{ user: AuthenticatedAccountUser }>("/api/auth/me", { headers: { Authorization: `Bearer ${accessToken}` } }).then((response) => response.user);
  }

  async logoutAuthSession(accessToken: string): Promise<void> {
    await this.send<null>("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
  }

  requestAccountDeletionChallenge(accessToken: string): Promise<AccountDeletionChallenge> {
    return this.send("/api/account/deletion-challenge", { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
  }

  deleteAccount(
    accessToken: string,
    input: { challengeId: string; code: string; confirmation: "DELETE" },
  ): Promise<AccountDeletionReceipt> {
    return this.send("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(input),
    });
  }

  claimGift(token: string, accessToken: string): Promise<{ id: string; status: "bound"; ownerEmail: string }> {
    return this.send(`/api/gifts/${encodeURIComponent(token)}/claim`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
  }

  getGiftEntryStatus(token: string): Promise<{ status: "initializing" | "unclaimed" | "bound" | "disabled" }> {
    return this.send(`/api/gifts/${encodeURIComponent(token)}/entry`);
  }

  getGiftAccess(token: string, accessToken: string): Promise<{ id: string; status: "bound"; role: GiftMemberRole; albumId: string | null; albumTitle: string | null; travelDate: string | null; publishedAt: string | null; version: number | null }> {
    return this.send(`/api/gifts/${encodeURIComponent(token)}/access`, { headers: { Authorization: `Bearer ${accessToken}` } });
  }

  getGiftAlbum(token: string, accessToken: string): Promise<{ title: string; travelDate: string | null; pages: { position: number; page: unknown }[]; media: { id: string; position: number; contentType: string; byteSize: number; readUrl: string }[]; publishedAt: string; version: number; cover: SharedAlbumCover | null }> {
    return this.send(`/api/gifts/${encodeURIComponent(token)}/album`, { headers: { Authorization: `Bearer ${accessToken}` } });
  }

  activateGiftViewer(token: string, accessToken: string): Promise<{ giftId: string; role: "viewer" | "editor"; albumPublished: boolean }> {
    return this.send(`/api/gifts/${encodeURIComponent(token)}/activate-viewer`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
  }

  startGiftPublish(token: string, accessToken: string, payload: SharedAlbumPublishPayload) {
    return this.send<{ publicationId: string; uploads: { position: number; objectKey: string; uploadUrl: string }[]; coverUpload: { uploadUrl: string } | null; expiresAt: string }>(`/api/gifts/${encodeURIComponent(token)}/publish`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(payload) });
  }

  finishGiftPublish(token: string, accessToken: string, publicationId: string): Promise<{ albumId: string }> {
    return this.send(`/api/gifts/${encodeURIComponent(token)}/publish`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ publicationId }) });
  }

  refreshGiftPublishUploads(token: string, accessToken: string, selection: RefreshPublicationUploadsSelection): Promise<RefreshedPublicationUploads> {
    return this.send(`/api/gifts/${encodeURIComponent(token)}/publish`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(selection) });
  }

  listOwnedGifts(accessToken: string): Promise<{ id: string; status: string; claimedAt: string | null; album: { title: string; travelDate: string | null; albumId: string; publishedAt: string; version: number; cover: SharedAlbumCover | null } | null }[]> {
    return this.send<{ items: { id: string; status: string; claimedAt: string | null; album: { title: string; travelDate: string | null; albumId: string; publishedAt: string; version: number; cover: SharedAlbumCover | null } | null }[] }>("/api/gifts/owned", { headers: { Authorization: `Bearer ${accessToken}` } }).then((response) => response.items);
  }

  getOwnedGiftManagement(accessToken: string, id: string): Promise<{ gift: { id: string; status: string; claimedAt: string | null; disabledAt: string | null }; members: { email: string; role: GiftMemberRole; createdAt: string }[]; album: { id: string; title: string; travelDate: string | null; sourceMemoryId: string; publishedAt: string; version: number; mediaCount: number } | null }> {
    return this.send(`/api/my-gifts/${encodeURIComponent(id)}/manage`, { headers: { Authorization: `Bearer ${accessToken}` } });
  }

  getOwnedGiftAlbum(id: string, accessToken: string): Promise<InvitedGiftAlbum> {
    return this.send<InvitedGiftAlbum>(`/api/my-gifts/${encodeURIComponent(id)}/album`, { headers: { Authorization: `Bearer ${accessToken}` } });
  }

  listOwnedGiftMembers(accessToken: string, id: string) {
    return this.send<{ members: { email: string; role: GiftMemberRole; createdAt: string }[] }>(`/api/my-gifts/${encodeURIComponent(id)}/members`, { headers: { Authorization: `Bearer ${accessToken}` } });
  }

  addOwnedGiftMember(accessToken: string, id: string, email: string, role: "viewer" | "editor" = "viewer") {
    return this.send<{ members: { email: string; role: GiftMemberRole; createdAt: string }[] }>(`/api/my-gifts/${encodeURIComponent(id)}/members`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ email, role }) });
  }

  updateOwnedGiftMemberRole(accessToken: string, id: string, email: string, role: "viewer" | "editor") {
    return this.send<{ members: { email: string; role: GiftMemberRole; createdAt: string }[] }>(`/api/my-gifts/${encodeURIComponent(id)}/members`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ email, role }) });
  }

  async removeOwnedGiftMember(accessToken: string, id: string, email: string): Promise<void> {
    await this.send<null>(`/api/my-gifts/${encodeURIComponent(id)}/members`, { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ email }) });
  }

  startOwnedGiftPublish(accessToken: string, id: string, payload: SharedAlbumPublishPayload) {
    return this.send<{ publicationId: string; uploads: { position: number; objectKey: string; uploadUrl: string }[]; coverUpload: { uploadUrl: string } | null; expiresAt: string }>(`/api/my-gifts/${encodeURIComponent(id)}/publish`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(payload) });
  }

  finishOwnedGiftPublish(accessToken: string, id: string, publicationId: string): Promise<{ albumId: string }> {
    return this.send(`/api/my-gifts/${encodeURIComponent(id)}/publish`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ publicationId }) });
  }

  refreshOwnedGiftPublishUploads(accessToken: string, id: string, selection: RefreshPublicationUploadsSelection): Promise<RefreshedPublicationUploads> {
    return this.send(`/api/my-gifts/${encodeURIComponent(id)}/publish`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(selection) });
  }

  async disableOwnedGift(accessToken: string, id: string): Promise<void> {
    await this.send<null>(`/api/my-gifts/${encodeURIComponent(id)}/disable`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
  }

  listGiftMembers(token: string, accessToken: string): Promise<{ members: { email: string; role: GiftMemberRole; createdAt: string }[]; maximumMembers: 3 }> {
    return this.send(`/api/gifts/${encodeURIComponent(token)}/members`, { headers: { Authorization: `Bearer ${accessToken}` } });
  }

  addGiftMember(token: string, accessToken: string, email: string, role: "viewer" | "editor" = "viewer") {
    return this.send(`/api/gifts/${encodeURIComponent(token)}/members`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ email, role }) });
  }

  updateGiftMemberRole(token: string, accessToken: string, email: string, role: "viewer" | "editor") {
    return this.send(`/api/gifts/${encodeURIComponent(token)}/members`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ email, role }) });
  }

  removeGiftMember(token: string, accessToken: string, email: string) {
    return this.send(`/api/gifts/${encodeURIComponent(token)}/members`, { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ email }) });
  }

  async disableGift(token: string, accessToken: string): Promise<void> {
    await this.send<null>(`/api/gifts/${encodeURIComponent(token)}/disable`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
  }

  // ── viewer: gifts shared with me ──────────────────────────────────

  listInvitedGifts(accessToken: string): Promise<InvitedGift[]> {
    return this.send<{ items: InvitedGift[] }>("/api/gifts/invited", { headers: { Authorization: `Bearer ${accessToken}` } }).then((response) => response.items);
  }

  getInvitedGiftAlbum(id: string, accessToken: string): Promise<InvitedGiftAlbum> {
    return this.send<InvitedGiftAlbum>(`/api/gifts/invited/${encodeURIComponent(id)}/album`, { headers: { Authorization: `Bearer ${accessToken}` } });
  }

  reportGiftContent(id: string, accessToken: string, reason: GiftContentReportReason, details?: string): Promise<{ status: "created" | "existing"; report: { id: string; snapshotVersion: number } }> {
    return this.send(`/api/gifts/${encodeURIComponent(id)}/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ reason, ...(details ? { details } : {}) }),
    });
  }

  blockGiftUser(id: string, accessToken: string, target: { targetUserId?: string; targetEmail?: string } = {}): Promise<{ status: "created" | "existing"; block: { id: string } }> {
    return this.send(`/api/gifts/${encodeURIComponent(id)}/blocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(target),
    });
  }

  async leaveGiftMembership(id: string, accessToken: string): Promise<void> {
    await this.send<null>(`/api/gifts/${encodeURIComponent(id)}/membership`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  startInvitedGiftPublish(id: string, accessToken: string, payload: SharedAlbumPublishPayload) {
    return this.send<{ publicationId: string; uploads: { position: number; objectKey: string; uploadUrl: string }[]; coverUpload: { uploadUrl: string } | null; expiresAt: string }>(`/api/gifts/invited/${encodeURIComponent(id)}/publish`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(payload) });
  }

  finishInvitedGiftPublish(id: string, accessToken: string, publicationId: string): Promise<{ albumId: string }> {
    return this.send(`/api/gifts/invited/${encodeURIComponent(id)}/publish`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ publicationId }) });
  }

  refreshInvitedGiftPublishUploads(id: string, accessToken: string, selection: RefreshPublicationUploadsSelection): Promise<RefreshedPublicationUploads> {
    return this.send(`/api/gifts/invited/${encodeURIComponent(id)}/publish`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(selection) });
  }

  createInvitedGiftManagementRequest(id: string, accessToken: string, input: { action: GiftManagementAction; targetEmail?: string; targetRole?: "viewer" | "editor" }): Promise<GiftManagementRequest> {
    return this.send<{ request: GiftManagementRequest }>(`/api/gifts/invited/${encodeURIComponent(id)}/management-requests`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(input) }).then(response => response.request);
  }

  listInvitedGiftManagementTargets(id: string, accessToken: string): Promise<{ email: string; role: "viewer" | "editor" }[]> {
    return this.send<{ members: { email: string; role: "viewer" | "editor" }[] }>(`/api/gifts/invited/${encodeURIComponent(id)}/management-requests`, { headers: { Authorization: `Bearer ${accessToken}` } }).then(response => response.members);
  }

  listOwnedGiftManagementRequests(accessToken: string, id: string): Promise<GiftManagementRequest[]> {
    return this.send<{ requests: GiftManagementRequest[] }>(`/api/my-gifts/${encodeURIComponent(id)}/management-requests`, { headers: { Authorization: `Bearer ${accessToken}` } }).then(response => response.requests);
  }

  decideOwnedGiftManagementRequest(accessToken: string, id: string, requestId: string, decision: "approved" | "rejected"): Promise<{ status: "approved" | "rejected" }> {
    return this.send(`/api/my-gifts/${encodeURIComponent(id)}/management-requests`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ requestId, decision }) });
  }

  registerDevice(installationId: string): Promise<DeviceRegistrationResponse> {
    return this.send<DeviceRegistrationResponse>("/api/devices/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installationId }),
    });
  }

  async listMemories(accessToken: string): Promise<CloudMemory[]> {
    const response = await this.send<{ items: CloudMemory[] }>("/api/memories", { headers: { Authorization: `Bearer ${accessToken}` } });
    return response.items;
  }

  async createMemory(accessToken: string, payload: CloudMemoryPayload): Promise<CloudMemory> {
    const response = await this.send<{ memory: CloudMemory }>("/api/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
    return response.memory;
  }

  async getMemory(accessToken: string, id: string): Promise<CloudMemory> {
    const response = await this.send<{ memory: CloudMemory }>(`/api/memories/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    return response.memory;
  }

  async updateMemory(accessToken: string, id: string, payload: CloudMemoryPayload): Promise<CloudMemory> {
    const response = await this.send<{ memory: CloudMemory }>(`/api/memories/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
    return response.memory;
  }

  async deleteMemory(accessToken: string, id: string): Promise<void> {
    await this.send<null>(`/api/memories/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
}
