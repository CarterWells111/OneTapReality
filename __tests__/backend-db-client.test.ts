import { createClientFromEnvironment } from "../src/server/db/client";

describe("server database client selection", () => {
  it("keeps local file databases available through the Node client", async () => {
    const client = createClientFromEnvironment({
      TURSO_DATABASE_URL: `file:./.data/client-test-${process.pid}-${Date.now()}.db`,
    });

    try {
      await expect(client.execute("select 1 as value")).resolves.toEqual(
        expect.objectContaining({ rows: expect.any(Array) }),
      );
    } finally {
      client.close();
    }
  });
});
