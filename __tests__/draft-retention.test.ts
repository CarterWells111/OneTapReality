import { draftBoxCapacity, trimOldDrafts } from "../src/storage/memory-repository";

const discardedAt = "2026-10-05T00:00:00.000Z";

describe("local draft retention", () => {
  it("keeps the newest drafts and moves only older ones belonging to the active library", async () => {
    const getAllAsync = jest.fn().mockResolvedValue([{ id: "oldest" }]);
    const runAsync = jest.fn().mockResolvedValue({ changes: 1 });
    const removed = await trimOldDrafts({ getAllAsync, runAsync } as any, "account:owner@example.com", discardedAt);
    expect(draftBoxCapacity).toBe(10);
    expect(getAllAsync.mock.calls[0][0]).toContain("status = 'draft'");
    expect(getAllAsync.mock.calls[0][0]).toContain(`OFFSET ${draftBoxCapacity}`);
    expect(getAllAsync.mock.calls[0][1]).toBe("account:owner@example.com");
    expect(removed).toEqual(["oldest"]);
  });

  // Overflow used to be deleted outright together with its photos. The draft box now
  // hands overflow to the recycle bin so the ten-day window is the only thing that
  // destroys a draft the person never explicitly threw away.
  it("moves overflow drafts into the recycle bin instead of deleting them", async () => {
    const getAllAsync = jest.fn().mockResolvedValue([{ id: "oldest" }]);
    const runAsync = jest.fn().mockResolvedValue({ changes: 1 });
    await trimOldDrafts({ getAllAsync, runAsync } as any, "guest", discardedAt);
    const [statement, ...parameters] = runAsync.mock.calls[0];
    expect(statement).toContain("UPDATE memories SET status = 'discarded'");
    expect(statement).toContain("discardedAt = ?");
    expect(statement).not.toContain("DELETE");
    expect(parameters).toEqual([discardedAt, discardedAt, "oldest", "guest"]);
  });

  it("does not report a draft that changed status before it could be moved", async () => {
    const getAllAsync = jest.fn().mockResolvedValue([{ id: "saved-in-the-meantime" }]);
    const runAsync = jest.fn().mockResolvedValue({ changes: 0 });
    expect(await trimOldDrafts({ getAllAsync, runAsync } as any, "guest", discardedAt)).toEqual([]);
  });
});
