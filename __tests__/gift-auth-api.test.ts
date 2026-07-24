jest.mock("../src/server/gifts/repository", () => ({ consumeGiftEmailCode: jest.fn(async () => true), createGiftSession: jest.fn(async () => undefined) }));
jest.mock("../src/server/auth/device-auth", () => ({ createAccessToken: jest.fn(() => "session-token"), hashAccessToken: jest.fn(async () => "session-hash") }));
jest.mock("../src/server/db/client", () => ({ getServerDatabase: jest.fn(() => ({})) }));

import { POST } from "../src/app/api/gift-auth/verify+api";

describe("gift email verification API", () => {
  it("creates a 30 day session after consuming a valid code", async () => {
    process.env.GIFT_AUTH_PEPPER = "pepper";
    const response = await POST(new Request("http://localhost/api/gift-auth/verify", { method: "POST", body: JSON.stringify({ email: "owner@example.com", code: "123456" }) }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ accessToken: "session-token", email: "owner@example.com" });
    delete process.env.GIFT_AUTH_PEPPER;
  });
});
