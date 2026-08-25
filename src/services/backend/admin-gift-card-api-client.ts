import { BackendApiClient } from "./api-client";

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
  events: {
    id: string;
    kind: string;
    actorEmail: string;
    metadata: unknown;
    createdAt: string;
  }[];
};

export class AdminGiftCardApiClient extends BackendApiClient {
  reserveGiftCard(
    accessToken: string,
    note?: string,
  ): Promise<{
    cardId: string;
    cardCode: string;
    giftUrl: string;
    expiresAt: string;
  }> {
    return this.send("/api/admin/gift-cards", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(note?.trim() ? { note: note.trim() } : {}),
    });
  }

  listAdminGiftCards(
    accessToken: string,
    filters: Partial<Pick<AdminGiftCard, "state" | "code" | "note">> = {},
  ): Promise<AdminGiftCard[]> {
    const query = new URLSearchParams();
    if (filters.state) query.set("state", filters.state);
    if (filters.code) query.set("code", filters.code);
    if (filters.note) query.set("note", filters.note);
    const queryString = query.toString();
    const suffix = queryString ? `?${queryString}` : "";
    return this.send<{ items: AdminGiftCard[] }>(
      `/api/admin/gift-cards${suffix}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    ).then((response) => response.items);
  }

  getAdminGiftCard(
    accessToken: string,
    cardId: string,
  ): Promise<AdminGiftCardDetail> {
    return this.send(`/api/admin/gift-cards/${encodeURIComponent(cardId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  activateAdminGiftCard(
    accessToken: string,
    cardId: string,
  ): Promise<{ activated: true }> {
    return this.send(
      `/api/admin/gift-cards/${encodeURIComponent(cardId)}/activate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  }

  retireAdminGiftCard(
    accessToken: string,
    cardId: string,
  ): Promise<{ retired: true }> {
    return this.send(
      `/api/admin/gift-cards/${encodeURIComponent(cardId)}/retire`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  }
}
