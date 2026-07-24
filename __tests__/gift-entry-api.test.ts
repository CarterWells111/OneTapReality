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
});
