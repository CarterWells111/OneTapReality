jest.mock("../src/server/db/client", () => ({ getServerDatabase: jest.fn(() => ({})) }));
jest.mock("../src/server/gifts/repository", () => ({ getGiftStatusByTokenHash: jest.fn(async () => "bound") }));
jest.mock("../src/server/auth/device-auth", () => ({ hashAccessToken: jest.fn(async () => "hashed-token") }));

import { GET } from "../src/app/api/gifts/[token]/entry+api";

describe("gift entry API", () => {
  it("returns only the registered gift state", async () => {
    process.env.GIFT_TOKEN_PEPPER = "test-pepper";
    const response = await GET(new Request("http://localhost/api/gifts/secret/entry"), { token: "secret" });

    expect(await response.json()).toEqual({ status: "bound" });
    expect(response.status).toBe(200);
    delete process.env.GIFT_TOKEN_PEPPER;
  });

  it("returns a stable maintenance response while gift sharing is paused", async () => {
    process.env.GIFT_SHARING_ENABLED = "false";

    const response = await GET(new Request("http://localhost/api/gifts/secret/entry"), { token: "secret" });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "gift_sharing_paused" }) }));
    delete process.env.GIFT_SHARING_ENABLED;
  });
});
