jest.mock("../src/server/db/client", () => ({ getServerDatabase: jest.fn(() => ({})) }));
jest.mock("../src/server/auth/device-auth", () => ({ hashAccessToken: jest.fn(async (value: string) => `hash:${value}`), extractBearerToken: jest.fn(() => "session-token") }));
jest.mock("../src/server/gifts/repository", () => ({ getGiftSessionEmail: jest.fn(async () => "owner@example.com"), claimGiftByTokenHash: jest.fn(async () => ({ id: "gift-1", status: "bound", ownerEmail: "owner@example.com" })) }));

import { POST } from "../src/app/api/gifts/[token]/claim+api";

describe("gift claim API", () => {
  it("claims an unbound pre-registered gift for the verified session email", async () => {
    process.env.GIFT_AUTH_PEPPER = "auth";
    process.env.GIFT_TOKEN_PEPPER = "gift";
    const response = await POST(new Request("http://localhost/api/gifts/tag/claim", { method: "POST", headers: { Authorization: "Bearer session-token" } }), { token: "tag" });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(expect.objectContaining({ status: "bound", ownerEmail: "owner@example.com" }));
  });
});
