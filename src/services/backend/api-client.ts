import type {
  BackendErrorBody,
  CapabilitiesResponse,
  CloudMemory,
  CloudMemoryPayload,
  DeviceRegistrationResponse,
  HealthResponse,
} from "./contracts";

export type AdminGiftCardState = "initializing" | "active" | "retired";
export type AdminGiftCard = {
  id: string;
  code: string;
  state: AdminGiftCardState;
  note: string | null;
  giftId: string | null;
  giftStatus: string | null;
  createdAt: string;
  activatedAt: string | null;
  retiredAt: string | null;
};
export type AdminGiftCardDetail = {
  card: AdminGiftCard & { expiresAt: string | null };
  events: { id: string; kind: string; actorEmail: string; metadata: unknown; createdAt: string }[];
};
export type AuthenticatedAccountUser = { id: string; email: string; isAdmin: boolean };
export type AuthenticatedAccountSession = { accessToken: string; user: AuthenticatedAccountUser };
export type GiftMemberRole = "owner" | "viewer" | "editor";
export type GiftManagementAction = "delete_album" | "remove_member" | "change_member_role";
export type GiftManagementRequest = { id: string; action: GiftManagementAction; targetEmail: string | null; targetRole: "viewer" | "editor" | null; status: "pending" | "approved" | "rejected"; createdAt: string; decidedAt: string | null };

export type InvitedGift = {
  giftId: string;
  role: "viewer" | "editor";
  album: {
    title: string;
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
export function resolveBackendRequestUrl(
  path: string,
  origin = process.env.EXPO_PUBLIC_API_ORIGIN,
): string {
  const normalizedOrigin = origin?.replace(/\/+$/u, "");
  return normalizedOrigin ? `${normalizedOrigin}${path}` : path;
}

export class BackendApiClient {
  constructor(private readonly request: typeof fetch = fetch) {}

  private async send<T>(path: string, options?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.request(resolveBackendRequestUrl(path), options);
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

  claimGift(token: string, accessToken: string): Promise<{ id: string; status: "bound"; ownerEmail: string }> {
    return this.send(`/api/gifts/${encodeURIComponent(token)}/claim`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
  }

  getGiftEntryStatus(token: string): Promise<{ status: "initializing" | "unclaimed" | "bound" | "disabled" }> {
    return this.send(`/api/gifts/${encodeURIComponent(token)}/entry`);
  }

  getGiftAccess(token: string, accessToken: string): Promise<{ id: string; status: "bound"; role: GiftMemberRole; albumId: string | null; albumTitle: string | null; publishedAt: string | null; version: number | null }> {
    return this.send(`/api/gifts/${encodeURIComponent(token)}/access`, { headers: { Authorization: `Bearer ${accessToken}` } });
  }

  getGiftAlbum(token: string, accessToken: string): Promise<{ title: string; pages: { position: number; page: unknown }[]; media: { id: string; position: number; contentType: string; byteSize: number; readUrl: string }[]; publishedAt: string; version: number; cover: SharedAlbumCover | null }> {
    return this.send(`/api/gifts/${encodeURIComponent(token)}/album`, { headers: { Authorization: `Bearer ${accessToken}` } });
  }

  activateGiftViewer(token: string, accessToken: string): Promise<{ giftId: string; role: "viewer" | "editor"; albumPublished: boolean }> {
    return this.send(`/api/gifts/${encodeURIComponent(token)}/activate-viewer`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
  }

  startGiftPublish(token: string, accessToken: string, payload: { baseVersion: number; sourceMemoryId: string; title: string; pages: { position: number; page: unknown }[]; media: { position: number; contentType: string; byteSize: number }[]; cover?: { contentType: string; byteSize: number } | null }) {
    return this.send<{ publicationId: string; uploads: { position: number; objectKey: string; uploadUrl: string }[]; coverUpload: { uploadUrl: string } | null; expiresAt: string }>(`/api/gifts/${encodeURIComponent(token)}/publish`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(payload) });
  }

  finishGiftPublish(token: string, accessToken: string, publicationId: string): Promise<{ albumId: string }> {
    return this.send(`/api/gifts/${encodeURIComponent(token)}/publish`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ publicationId }) });
  }

  listOwnedGifts(accessToken: string): Promise<{ id: string; status: string; claimedAt: string | null; album: { title: string; albumId: string; publishedAt: string; version: number; cover: SharedAlbumCover | null } | null }[]> {
    return this.send<{ items: { id: string; status: string; claimedAt: string | null; album: { title: string; albumId: string; publishedAt: string; version: number; cover: SharedAlbumCover | null } | null }[] }>("/api/gifts/owned", { headers: { Authorization: `Bearer ${accessToken}` } }).then((response) => response.items);
  }

  getOwnedGiftManagement(accessToken: string, id: string): Promise<{ gift: { id: string; status: string; claimedAt: string | null; disabledAt: string | null }; members: { email: string; role: GiftMemberRole; createdAt: string }[]; album: { id: string; title: string; sourceMemoryId: string; publishedAt: string; version: number; mediaCount: number } | null }> {
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

  startOwnedGiftPublish(accessToken: string, id: string, payload: { baseVersion: number; sourceMemoryId: string; title: string; pages: { position: number; page: unknown }[]; media: ({ position: number; mediaId: string } | { position: number; contentType: string; byteSize: number })[]; cover?: { contentType: string; byteSize: number } | null }) {
    return this.send<{ publicationId: string; uploads: { position: number; objectKey: string; uploadUrl: string }[]; coverUpload: { uploadUrl: string } | null; expiresAt: string }>(`/api/my-gifts/${encodeURIComponent(id)}/publish`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(payload) });
  }

  finishOwnedGiftPublish(accessToken: string, id: string, publicationId: string): Promise<{ albumId: string }> {
    return this.send(`/api/my-gifts/${encodeURIComponent(id)}/publish`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ publicationId }) });
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

  startInvitedGiftPublish(id: string, accessToken: string, payload: { baseVersion: number; sourceMemoryId: string; title: string; pages: { position: number; page: unknown }[]; media: ({ position: number; mediaId: string } | { position: number; contentType: string; byteSize: number })[]; cover?: { contentType: string; byteSize: number } | null }) {
    return this.send<{ publicationId: string; uploads: { position: number; objectKey: string; uploadUrl: string }[]; coverUpload: { uploadUrl: string } | null; expiresAt: string }>(`/api/gifts/invited/${encodeURIComponent(id)}/publish`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(payload) });
  }

  finishInvitedGiftPublish(id: string, accessToken: string, publicationId: string): Promise<{ albumId: string }> {
    return this.send(`/api/gifts/invited/${encodeURIComponent(id)}/publish`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ publicationId }) });
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

  reserveGiftCard(accessToken: string, note?: string): Promise<{ cardId: string; cardCode: string; giftUrl: string; expiresAt: string }> {
    return this.send("/api/admin/gift-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(note?.trim() ? { note: note.trim() } : {}),
    });
  }

  listAdminGiftCards(accessToken: string, filters: Partial<Pick<AdminGiftCard, "state" | "code" | "note">> = {}): Promise<AdminGiftCard[]> {
    const query = new URLSearchParams();
    if (filters.state) query.set("state", filters.state);
    if (filters.code) query.set("code", filters.code);
    if (filters.note) query.set("note", filters.note);
    const queryString = query.toString();
    const suffix = queryString ? `?${queryString}` : "";
    return this.send<{ items: AdminGiftCard[] }>(`/api/admin/gift-cards${suffix}`, { headers: { Authorization: `Bearer ${accessToken}` } }).then((response) => response.items);
  }

  getAdminGiftCard(accessToken: string, cardId: string): Promise<AdminGiftCardDetail> {
    return this.send(`/api/admin/gift-cards/${encodeURIComponent(cardId)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  }

  activateAdminGiftCard(accessToken: string, cardId: string): Promise<{ activated: true }> {
    return this.send(`/api/admin/gift-cards/${encodeURIComponent(cardId)}/activate`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
  }

  retireAdminGiftCard(accessToken: string, cardId: string): Promise<{ retired: true }> {
    return this.send(`/api/admin/gift-cards/${encodeURIComponent(cardId)}/retire`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
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
