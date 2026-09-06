type AdminClient = {
  readonly reserveGiftCard: (
    accessToken: string,
    note?: string,
  ) => Promise<{ cardId: string; displayNumber: number; cardCode: string }>;
  readonly listAdminGiftCards: (
    accessToken: string,
    filters?: { state?: string; search?: string },
  ) => Promise<{ id: string }[]>;
  readonly getAdminGiftCard: (
    accessToken: string,
    cardId: string,
  ) => Promise<{ card: { displayNumber: number } }>;
  readonly updateAdminGiftCard: (
    accessToken: string,
    cardId: string,
    metadata: { name: string | null; note: string | null },
  ) => Promise<{ card: { name: string | null } }>;
  readonly activateAdminGiftCard: (
    accessToken: string,
    cardId: string,
  ) => Promise<{ activated: true }>;
  readonly retireAdminGiftCard: (
    accessToken: string,
    cardId: string,
  ) => Promise<{ retired: true }>;
};

type AdminClientConstructor = new (request?: typeof fetch, origin?: string) => AdminClient;

const adminClientModule = (() => {
  try {
    return require("../src/services/backend/admin-gift-card-api-client") as {
      readonly AdminGiftCardApiClient?: AdminClientConstructor;
    };
  } catch {
    return {};
  }
})();

function requireAdminClient(): AdminClientConstructor | null {
  const Client = adminClientModule.AdminGiftCardApiClient;
  if (typeof Client !== "function") {
    expect(Client).toEqual(expect.any(Function));
    return null;
  }
  return Client;
}

describe("admin gift-card API client", () => {
  it("reserves a developer gift card with the gift session bearer token", async () => {
    const Client = requireAdminClient();
    if (!Client) return;
    const request = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      cardId: "card-1",
      displayNumber: 1,
      cardCode: "CARD-001",
      giftUrl: "https://onetapreality.com/gift/unique-token",
      expiresAt: "2026-07-24T00:15:00.000Z",
    }), { status: 201 }));

    await expect(new Client(request, "").reserveGiftCard("gift-session", "July batch")).resolves.toEqual(
      expect.objectContaining({ cardId: "card-1", displayNumber: 1, cardCode: "CARD-001" }),
    );
    expect(request).toHaveBeenCalledWith("/api/admin/gift-cards", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer gift-session" }),
    }));
  });

  it("lists, inspects, updates, activates, and retires cards with the developer session", async () => {
    const Client = requireAdminClient();
    if (!Client) return;
    const request = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "card-1", displayNumber: 1, name: null, state: "active" }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ card: { id: "card-1", displayNumber: 1, name: null, state: "active" }, events: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ card: { id: "card-1", displayNumber: 1, name: "Launch", note: null, state: "active" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ activated: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ retired: true })));
    const client = new Client(request, "");

    await expect(client.listAdminGiftCards("gift-session", { state: "active", search: "Launch" })).resolves.toEqual([
      expect.objectContaining({ id: "card-1" }),
    ]);
    await expect(client.getAdminGiftCard("gift-session", "card-1")).resolves.toEqual(expect.objectContaining({ card: expect.objectContaining({ displayNumber: 1 }) }));
    await expect(client.updateAdminGiftCard("gift-session", "card-1", { name: "Launch", note: null })).resolves.toEqual(expect.objectContaining({ card: expect.objectContaining({ name: "Launch" }) }));
    await expect(client.activateAdminGiftCard("gift-session", "card-1")).resolves.toEqual({ activated: true });
    await expect(client.retireAdminGiftCard("gift-session", "card-1")).resolves.toEqual({ retired: true });
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      "/api/admin/gift-cards?state=active&search=Launch",
      "/api/admin/gift-cards/card-1",
      "/api/admin/gift-cards/card-1",
      "/api/admin/gift-cards/card-1/activate",
      "/api/admin/gift-cards/card-1/retire",
    ]);
  });
});
