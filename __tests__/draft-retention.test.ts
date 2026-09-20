import { trimOldDrafts } from "../src/storage/memory-repository";

describe("local draft retention", () => {
  it("removes only older drafts belonging to the active library", async () => {
    const getAllAsync = jest.fn().mockResolvedValue([{ id: "oldest" }]);
    const runAsync = jest.fn().mockResolvedValue({ changes: 1 });
    const removed = await trimOldDrafts({ getAllAsync, runAsync } as any, "account:owner@example.com");
    expect(getAllAsync.mock.calls[0][0]).toContain("status = 'draft'");
    expect(getAllAsync.mock.calls[0][0]).toContain("OFFSET 4");
    expect(getAllAsync.mock.calls[0][1]).toBe("account:owner@example.com");
    expect(runAsync).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM memories"), "oldest", "account:owner@example.com");
    expect(removed).toEqual(["oldest"]);
  });

  it("does not release photo files if a draft changed status before deletion", async () => {
    const getAllAsync = jest.fn().mockResolvedValue([{ id: "saved-in-the-meantime" }]);
    const runAsync = jest.fn().mockResolvedValue({ changes: 0 });
    expect(await trimOldDrafts({ getAllAsync, runAsync } as any, "guest")).toEqual([]);
  });
});
