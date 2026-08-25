import type { SQLiteDatabase } from "expo-sqlite";

import {
  acquireLocalLibraryWriteLease,
  beginExclusiveLocalLibraryOperation,
  beginGuestLibraryMigration,
} from "../src/features/auth/local-library-write-lease";

describe("local library write leases", () => {
  it("blocks new guest writes synchronously and waits for an existing writer before migration", async () => {
    const db = {} as SQLiteDatabase;
    const existingWrite = acquireLocalLibraryWriteLease(db, "guest", () => undefined);
    let migrationReady = false;

    const pendingMigration = beginGuestLibraryMigration(db).then((lease) => {
      migrationReady = true;
      return lease;
    });

    expect(() => acquireLocalLibraryWriteLease(db, "guest", () => undefined))
      .toThrow("本机旅行册正在迁移");
    await Promise.resolve();
    expect(migrationReady).toBe(false);

    existingWrite.release();
    const migration = await pendingMigration;
    expect(migrationReady).toBe(true);
    expect(() => acquireLocalLibraryWriteLease(db, "guest", () => undefined))
      .toThrow("本机旅行册正在迁移");

    migration.release();
    const nextWrite = acquireLocalLibraryWriteLease(db, "guest", () => undefined);
    nextWrite.release();
  });

  it("offers the same synchronous exclusive lease for account-library deletion", async () => {
    const db = {} as SQLiteDatabase;
    const deletion = await beginExclusiveLocalLibraryOperation(
      db,
      "正在删除当前账户的本机旅行册，请稍后再试",
    );

    expect(() => acquireLocalLibraryWriteLease(db, "account:owner@example.com", () => undefined))
      .toThrow("正在删除当前账户的本机旅行册");

    deletion.release();
    const nextWrite = acquireLocalLibraryWriteLease(db, "account:owner@example.com", () => undefined);
    nextWrite.release();
  });
});
