import {
  migrateDbIfNeeded,
  purgeExpiredDiscardedMemories,
  recycleBinRetentionDays,
  remainingRetentionDays,
} from "../src/storage/memory-repository";

const now = "2026-10-05T00:00:00.000Z";
const cutoff = "2026-09-25T00:00:00.000Z";

describe("recycle bin retention", () => {
  it("purges only entries discarded longer ago than the retention window", async () => {
    const getAllAsync = jest.fn().mockResolvedValue([{ id: "expired" }]);
    const runAsync = jest.fn().mockResolvedValue({ changes: 1 });

    const removed = await purgeExpiredDiscardedMemories({ getAllAsync, runAsync } as any, "guest", now);

    expect(recycleBinRetentionDays).toBe(10);
    const [statement, owner, boundary] = getAllAsync.mock.calls[0];
    expect(statement).toContain("status = 'discarded'");
    expect(owner).toBe("guest");
    expect(boundary).toBe(cutoff);
    expect(removed).toEqual(["expired"]);
  });

  // A restore clears discardedAt, so the delete re-checks the same condition that
  // selected the row. Without that guard a purge could destroy an album the person
  // pulled back out of the recycle bin a moment earlier.
  it("does not report an entry that was restored before the delete ran", async () => {
    const getAllAsync = jest.fn().mockResolvedValue([{ id: "restored" }]);
    const runAsync = jest.fn().mockResolvedValue({ changes: 0 });

    expect(await purgeExpiredDiscardedMemories({ getAllAsync, runAsync } as any, "guest", now)).toEqual([]);
    expect(runAsync.mock.calls[0][0]).toContain("discardedAt <= ?");
  });

  it("never selects an entry that has no recorded discard time", async () => {
    const getAllAsync = jest.fn().mockResolvedValue([]);
    const runAsync = jest.fn();

    await purgeExpiredDiscardedMemories({ getAllAsync, runAsync } as any, "guest", now);

    expect(getAllAsync.mock.calls[0][0]).toContain("discardedAt IS NOT NULL");
    expect(runAsync).not.toHaveBeenCalled();
  });

  describe("remaining days shown in the recycle bin", () => {
    it("counts the whole days left before the entry is purged", () => {
      expect(remainingRetentionDays("2026-10-02T00:00:00.000Z", now)).toBe(7);
    });

    // A part-used day still reads as a day left, so nothing shows "0 天" while it
    // is in fact still recoverable.
    it("rounds a partly used day up so a recoverable entry never reads as zero", () => {
      expect(remainingRetentionDays("2026-09-26T00:00:00.000Z", "2026-10-05T12:00:00.000Z")).toBe(1);
    });

    it("reports zero once the window has passed", () => {
      expect(remainingRetentionDays("2026-09-20T00:00:00.000Z", now)).toBe(0);
    });

    it("has nothing to report for an entry with no recorded discard time", () => {
      expect(remainingRetentionDays(null, now)).toBeNull();
      expect(remainingRetentionDays(undefined, now)).toBeNull();
    });
  });

  // Albums discarded before this version have no discardedAt. Backfilling them at the
  // upgrade gives every one of them a full window instead of purging them on first launch.
  it("starts the retention clock at upgrade time for entries discarded by an older version", async () => {
    const execAsync = jest.fn().mockResolvedValue(undefined);
    const getAllAsync = jest.fn(async (statement: string) =>
      statement.startsWith("PRAGMA table_info(memories)") ? [{ name: "id" }] : [],
    );
    const runAsync = jest.fn().mockResolvedValue({ changes: 0 });
    const withTransactionAsync = jest.fn(async (operation: () => Promise<void>) => {
      await operation();
    });

    await migrateDbIfNeeded({ execAsync, getAllAsync, runAsync, withTransactionAsync } as any);

    const backfill = runAsync.mock.calls.find(([statement]) =>
      String(statement).includes("SET discardedAt = ?"),
    );
    expect(backfill).toBeDefined();
    expect(String(backfill?.[0])).toContain("status = 'discarded'");
    expect(String(backfill?.[0])).toContain("discardedAt IS NULL");
    expect(typeof backfill?.[1]).toBe("string");
  });
});
