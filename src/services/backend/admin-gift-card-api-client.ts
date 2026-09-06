import { BackendApiClient } from "./api-client";

export type AdminGiftCardState = "initializing" | "active" | "retired";

export type AdminGiftCard = {
  id: string;
  displayNumber: number;
  name: string | null;
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
    displayNumber: number;
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
    filters: { state?: AdminGiftCardState; search?: string } = {},
  ): Promise<AdminGiftCard[]> {
    const query = new URLSearchParams();
    if (filters.state) query.set("state", filters.state);
    if (filters.search) query.set("search", filters.search);
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

  updateAdminGiftCard(
    accessToken: string,
    cardId: string,
    metadata: { name: string | null; note: string | null },
  ): Promise<{ card: AdminGiftCard }> {
    return this.send(`/api/admin/gift-cards/${encodeURIComponent(cardId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(metadata),
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
