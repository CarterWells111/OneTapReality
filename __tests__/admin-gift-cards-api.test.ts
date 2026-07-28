jest.mock("../src/server/db/client", () => ({ getServerDatabase: jest.fn(() => ({ database: true })) }));
jest.mock("../src/server/gifts/session-auth", () => ({
  requireGiftSessionEmail: jest.fn(async () => "developer@example.com"),
  hashGiftToken: jest.fn(async (token: string) => `hash:${token}`),
}));
jest.mock("../src/server/gifts/admin-auth", () => ({ requireGiftAdminEmail: jest.fn((email: string) => email) }));
jest.mock("../src/server/gifts/repository", () => ({
  activateGiftCard: jest.fn(async () => true),
  createInitializingGiftCard: jest.fn(async () => undefined),
  expireGiftCardReservations: jest.fn(async () => 0),
  getGiftCardDetails: jest.fn(async () => ({ card: { id: "card-1", code: "CARD-ABC", state: "active", giftStatus: "unclaimed" }, events: [] })),
  listGiftCards: jest.fn(async () => [{ id: "card-1", code: "CARD-ABC", state: "active", note: null }]),
  retireGiftCard: jest.fn(async () => true),
}));

import { GET, POST as createCard } from "../src/app/api/admin/gift-cards+api";
import { POST as activateCard } from "../src/app/api/admin/gift-cards/[id]/activate+api";
import { GET as getCard } from "../src/app/api/admin/gift-cards/[id]+api";
import { POST as retireCard } from "../src/app/api/admin/gift-cards/[id]/retire+api";
import { createInitializingGiftCard, expireGiftCardReservations, listGiftCards } from "../src/server/gifts/repository";

describe("admin gift card APIs", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists cards only after expiring stale reservations for a verified administrator", async () => {
    const response = await GET(new Request("http://localhost/api/admin/gift-cards", { headers: { Authorization: "Bearer session" } }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [{ id: "card-1", code: "CARD-ABC", state: "active", note: null }] });
    expect(expireGiftCardReservations).toHaveBeenCalledTimes(1);
    expect(listGiftCards).toHaveBeenCalledTimes(1);
  });

  it("creates a fifteen-minute private reservation and returns only card activation data", async () => {
    process.env.GIFT_URL_ORIGIN = "https://staging.onetapreality.com/";
    const response = await createCard(new Request("http://localhost/api/admin/gift-cards", {
      method: "POST",
      headers: { Authorization: "Bearer session", "Content-Type": "application/json" },
      body: JSON.stringify({ note: "July batch" }),
    }));

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload).toEqual({
      cardId: expect.any(String),
      cardCode: expect.stringMatching(/^CARD-[A-F0-9]{24}$/u),
      giftUrl: expect.stringMatching(/^https:\/\/staging\.onetapreality\.com\/gift\/[A-Za-z0-9_-]{43}$/u),
      expiresAt: expect.any(String),
    });
    expect(createInitializingGiftCard).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      cardId: payload.cardId,
      cardCode: payload.cardCode,
      note: "July batch",
      tokenHash: expect.stringMatching(/^hash:/u),
      adminEmail: "developer@example.com",
      expiresAt: payload.expiresAt,
    }));
    delete process.env.GIFT_URL_ORIGIN;
  });

  it("does not reveal card inventory to a verified non-administrator", async () => {
    const { requireGiftAdminEmail } = jest.requireMock("../src/server/gifts/admin-auth") as { requireGiftAdminEmail: jest.Mock };
    requireGiftAdminEmail.mockImplementationOnce(() => {
      const { ApiError } = jest.requireActual("../src/server/http/errors") as typeof import("../src/server/http/errors");
      throw new ApiError(403, "gift_admin_required", "Not permitted");
    });

    const response = await GET(new Request("http://localhost/api/admin/gift-cards", { headers: { Authorization: "Bearer session" } }));

    expect(response.status).toBe(403);
    expect(expireGiftCardReservations).not.toHaveBeenCalled();
    expect(listGiftCards).not.toHaveBeenCalled();
  });

  it("confirms activation only for the verified administrator", async () => {
    const response = await activateCard(new Request("http://localhost/api/admin/gift-cards/card-1/activate", {
      method: "POST",
      headers: { Authorization: "Bearer session" },
    }), { id: "card-1" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ activated: true });
  });

  it("forwards state, code, and note filters without exposing raw inventory rules", async () => {
    const response = await GET(new Request("http://localhost/api/admin/gift-cards?state=active&code=JULY&note=batch", { headers: { Authorization: "Bearer session" } }));

    expect(response.status).toBe(200);
    expect(listGiftCards).toHaveBeenCalledWith(expect.anything(), { state: "active", code: "JULY", note: "batch" });
  });

  it("returns a card detail and allows retirement through administrator-only endpoints", async () => {
    const detail = await getCard(new Request("http://localhost/api/admin/gift-cards/card-1", { headers: { Authorization: "Bearer session" } }), { id: "card-1" });
    const retired = await retireCard(new Request("http://localhost/api/admin/gift-cards/card-1/retire", { method: "POST", headers: { Authorization: "Bearer session" } }), { id: "card-1" });

    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toEqual(expect.objectContaining({ card: expect.objectContaining({ id: "card-1" }) }));
    expect(retired.status).toBe(200);
    await expect(retired.json()).resolves.toEqual({ retired: true });
  });

  it("retries a database card-code collision before returning a reservation", async () => {
    const { createInitializingGiftCard: createReservation } = jest.requireMock("../src/server/gifts/repository") as { createInitializingGiftCard: jest.Mock };
    createReservation.mockRejectedValueOnce({ code: "23505", constraint: "gift_cards_code_unique" });

    const response = await createCard(new Request("http://localhost/api/admin/gift-cards", {
      method: "POST", headers: { Authorization: "Bearer session", "Content-Type": "application/json" }, body: "{}",
    }));

    expect(response.status).toBe(201);
    expect(createReservation).toHaveBeenCalledTimes(2);
  });
});
