import type { SQLiteDatabase } from "expo-sqlite";

import {
  chooseGuestLibrary,
  migrateGuestLibraryToAccount,
  type PreparedGuestLibraryFiles,
} from "../src/features/auth/guest-library-migration";

const owner = "account:owner@example.com" as const;

function migrationDatabase(options?: { failOwnerUpdate?: boolean }) {
  const events: string[] = [];
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let guestOwner = "guest";
  const content = { draft: "draft-v1", memory: "memory-v1", page: "page-v1", photo: "photo-v1" };
  const queryRows = <T,>(sql: string): T[] => {
    if (guestOwner !== "guest") return [];
    if (sql.includes("FROM memory_photos")) {
      return [{ memory_id: "memory-1", uri: content.photo, position: 0 }] as T[];
    }
    if (sql.includes("FROM story_pages")) {
      return [{ memory_id: "memory-1", id: "page-1", body: content.page }] as T[];
    }
    if (sql.includes("FROM memory_edit_drafts")) {
      return [{ memory_id: "memory-1", owner_account_key: "guest", pages_json: content.draft }] as T[];
    }
    if (sql.includes("FROM city_collection_arrangements")) return [];
    if (sql.includes("FROM memories")) {
      return [{ id: "memory-1", title: content.memory, ownerAccountKey: "guest" }] as T[];
    }
    return [];
  };
  const tx = {
    getAllAsync: async <T>(sql: string) => {
      events.push(`query:${sql.slice(0, 20)}`);
      return queryRows<T>(sql);
    },
    runAsync: async (sql: string, ...params: unknown[]) => {
      calls.push({ sql, params });
      if (sql.startsWith("UPDATE memories SET ownerAccountKey")) {
        if (options?.failOwnerUpdate) throw new Error("injected sqlite failure");
        guestOwner = String(params[0]);
      }
      return { changes: 1 };
    },
  };
  const db = {
    getAllAsync: async <T>(sql: string) => queryRows<T>(sql),
    withExclusiveTransactionAsync: async (callback: (transaction: typeof tx) => Promise<void>) => {
      events.push("transaction:start");
      const before = guestOwner;
      try {
        await callback(tx);
        events.push("transaction:commit");
      } catch (error) {
        guestOwner = before;
        events.push("transaction:rollback");
        throw error;
      }
    },
  } as unknown as SQLiteDatabase;
  return {
    calls,
    db,
    events,
    getGuestOwner: () => guestOwner,
    mutateContent: (kind: keyof typeof content) => { content[kind] = `${kind}-v2`; },
  };
}

function preparedFiles(events: string[]): PreparedGuestLibraryFiles {
  return {
    replacements: new Map([
      ["documents://photos/accounts/guest/memory-1/photo.jpg", "documents://photos/accounts/owner%40example.com/memory-1/photo.jpg"],
    ]),
    commitCleanup: async () => { events.push("files:source-cleaned"); },
    rollback: async () => { events.push("files:copies-rolled-back"); },
  };
}

describe("explicit guest library migration", () => {
  it("copies and verifies files before one exclusive SQLite owner/reference transaction, then clears guest files", async () => {
    const { calls, db, events, getGuestOwner } = migrationDatabase();

    await migrateGuestLibraryToAccount(db, owner, {
      prepareFiles: async (_owner, ids) => {
        events.push(`files:prepared:${ids.join(",")}`);
        return preparedFiles(events);
      },
      now: () => "2026-08-24T12:00:00.000Z",
    });

    expect(events).toEqual([
      "files:prepared:memory-1",
      "transaction:start",
      expect.stringMatching(/^query:/),
      expect.stringMatching(/^query:/),
      expect.stringMatching(/^query:/),
      expect.stringMatching(/^query:/),
      expect.stringMatching(/^query:/),
      "transaction:commit",
      "files:source-cleaned",
    ]);
    expect(getGuestOwner()).toBe(owner);
    const sql = calls.map((call) => call.sql).join("\n");
    expect(sql).toContain("UPDATE memories SET ownerAccountKey");
    expect(sql).toContain("UPDATE memory_photos SET uri = replace");
    expect(sql).toContain("UPDATE story_pages SET photo_uri = replace");
    expect(sql).toContain("layout_json = replace");
    expect(sql).toContain("UPDATE memory_edit_drafts SET pages_json = replace");
    expect(sql).toContain("local_library_account_choices");
  });

  it("rolls back SQLite and copied files while retaining guest sources when the transaction fails", async () => {
    const { db, events, getGuestOwner } = migrationDatabase({ failOwnerUpdate: true });

    await expect(migrateGuestLibraryToAccount(db, owner, {
      prepareFiles: async () => preparedFiles(events),
      now: () => "2026-08-24T12:00:00.000Z",
    })).rejects.toThrow("injected sqlite failure");

    expect(getGuestOwner()).toBe("guest");
    expect(events).toContain("transaction:rollback");
    expect(events).toContain("files:copies-rolled-back");
    expect(events).not.toContain("files:source-cleaned");
  });

  it("can persist an account decision to keep using guest without moving any rows", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      runAsync: async (sql: string, ...params: unknown[]) => { calls.push({ sql, params }); return { changes: 1 }; },
    } as unknown as SQLiteDatabase;

    await chooseGuestLibrary(db, owner, "2026-08-24T12:00:00.000Z");

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain("local_library_account_choices");
    expect(calls[0].params).toEqual([owner, "guest", "2026-08-24T12:00:00.000Z"]);
  });

  it("rejects a runtime guest owner even if an untyped caller bypasses TypeScript", async () => {
    const { db } = migrationDatabase();
    await expect(migrateGuestLibraryToAccount(db, "guest" as typeof owner, {
      prepareFiles: async () => { throw new Error("must not copy"); },
    })).rejects.toThrow("requires an account owner");
  });

  it("keeps a committed account migration successful when post-commit guest cleanup fails", async () => {
    const { db, events, getGuestOwner } = migrationDatabase();
    const prepared = preparedFiles(events);
    prepared.commitCleanup = async () => { throw new Error("cleanup unavailable"); };

    await expect(migrateGuestLibraryToAccount(db, owner, {
      prepareFiles: async () => prepared,
      now: () => "2026-08-24T12:00:00.000Z",
    })).resolves.toBeUndefined();

    expect(getGuestOwner()).toBe(owner);
    expect(events).toContain("transaction:commit");
    expect(events).not.toContain("files:copies-rolled-back");
  });

  it.each(["memory", "photo", "page", "draft"] as const)(
    "rejects a same-id guest %s change made while files are being prepared",
    async (kind) => {
      const { db, events, getGuestOwner, mutateContent } = migrationDatabase();

      await expect(migrateGuestLibraryToAccount(db, owner, {
        prepareFiles: async () => {
          mutateContent(kind);
          return preparedFiles(events);
        },
        now: () => "2026-08-24T12:00:00.000Z",
      })).rejects.toThrow("Guest library changed during migration");

      expect(getGuestOwner()).toBe("guest");
      expect(events).toContain("files:copies-rolled-back");
      expect(events).not.toContain("files:source-cleaned");
    },
  );
});
