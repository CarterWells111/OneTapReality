jest.mock("../src/server/db/client", () => ({ getServerDatabase: jest.fn(() => ({ database: true })) }));
jest.mock("../src/server/gifts/repository", () => ({
  expireGiftCardReservations: jest.fn(async () => 0),
  getGiftSessionEmail: jest.fn(async () => null),
  listGiftCards: jest.fn(async () => [{ id: "private-card" }]),
}));

import { GET } from "../src/app/api/admin/gift-cards+api";
import { getGiftSessionEmail, listGiftCards } from "../src/server/gifts/repository";

describe("admin gift card API authorization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GIFT_AUTH_PEPPER = "auth-pepper";
    process.env.GIFT_ADMIN_EMAILS = "admin@example.com";
  });

  it("rejects a request with no bearer session before querying inventory", async () => {
    const response = await GET(new Request("http://localhost/api/admin/gift-cards"));

    expect(response.status).toBe(401);
    expect(listGiftCards).not.toHaveBeenCalled();
  });

  it("rejects an expired bearer session before querying inventory", async () => {
    const response = await GET(new Request("http://localhost/api/admin/gift-cards", { headers: { Authorization: "Bearer expired" } }));

    expect(response.status).toBe(401);
    expect(getGiftSessionEmail).toHaveBeenCalled();
    expect(listGiftCards).not.toHaveBeenCalled();
  });

  it("enforces GIFT_ADMIN_EMAILS for an otherwise valid session without querying inventory", async () => {
    (getGiftSessionEmail as jest.Mock).mockResolvedValueOnce("other@example.com");

    const response = await GET(new Request("http://localhost/api/admin/gift-cards", { headers: { Authorization: "Bearer valid" } }));

    expect(response.status).toBe(403);
    expect(listGiftCards).not.toHaveBeenCalled();
  });
});
