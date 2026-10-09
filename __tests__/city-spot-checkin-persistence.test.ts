import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded, clearMemories } from '../src/storage/memory-repository';
import { listCitySpotCheckins, setCitySpotCheckin } from '../src/storage/city-spot-checkin-repository';
import { hasGuestLibrary, migrateGuestLibraryToAccount } from '../src/features/auth/guest-library-migration';

function open(path: string) {
  const sqlite = new DatabaseSync(path);
  const db = {
    execAsync: async (sql: string) => { sqlite.exec(sql); },
    runAsync: async (sql: string, ...params: (string|number|null)[]) => sqlite.prepare(sql).run(...params),
    getAllAsync: async (sql: string, ...params: (string|number|null)[]) => sqlite.prepare(sql).all(...params),
    getFirstAsync: async (sql: string, ...params: (string|number|null)[]) => sqlite.prepare(sql).get(...params) ?? null,
    withTransactionAsync: async (fn: () => Promise<void>) => {
      sqlite.exec('BEGIN'); try { await fn(); sqlite.exec('COMMIT'); } catch(e) { sqlite.exec('ROLLBACK'); throw e; }
    },
    withExclusiveTransactionAsync: async (fn: (tx: SQLiteDatabase) => Promise<void>) => db.withTransactionAsync(() => fn(db as unknown as SQLiteDatabase)),
  };
  return { db: db as unknown as SQLiteDatabase, close: () => sqlite.close() };
}
const owner = 'account:owner@example.com';
const early = '2026-10-08T01:00:00.000Z';
const late = '2026-10-09T01:00:00.000Z';

it('persists across database reopen, cancels exactly one spot and isolates owners/cities', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'city-checkins-'));
  let database = open(join(directory, 'library.db'));
  try {
    await migrateDbIfNeeded(database.db);
    await setCitySpotCheckin(database.db, owner, 'beijing', 'beijing-01', true, early);
    await setCitySpotCheckin(database.db, 'guest', 'beijing', 'beijing-01', true, late);
    await setCitySpotCheckin(database.db, owner, 'shanghai', 'shanghai-01', true, late);
    database.close(); database = open(join(directory, 'library.db'));
    expect(await listCitySpotCheckins(database.db, owner, 'beijing')).toEqual([{spotId:'beijing-01',markedAt:early}]);
    await setCitySpotCheckin(database.db, owner, 'beijing', 'beijing-01', false);
    expect(await listCitySpotCheckins(database.db, owner, 'beijing')).toEqual([]);
    expect(await listCitySpotCheckins(database.db, 'guest', 'beijing')).toHaveLength(1);
    expect(await listCitySpotCheckins(database.db, owner, 'shanghai')).toHaveLength(1);
  } finally {
    database.close();
    for (const name of ['library.db','library.db-wal','library.db-shm']) rmSync(join(directory,name),{force:true});
    rmdirSync(directory);
  }
});

it('detects a checkins-only guest library and merges duplicates with the earliest time atomically', async () => {
  const database=open(':memory:');
  try {
    await migrateDbIfNeeded(database.db);
    await setCitySpotCheckin(database.db, owner, 'beijing','beijing-01',true,late);
    await setCitySpotCheckin(database.db,'guest','beijing','beijing-01',true,early);
    await setCitySpotCheckin(database.db,'guest','beijing','beijing-02',true,late);
    expect(await hasGuestLibrary(database.db)).toBe(true);
    await migrateGuestLibraryToAccount(database.db,owner,{prepareFiles:async()=>({replacements:new Map(),commitCleanup:async()=>{},rollback:async()=>{}})});
    expect(await listCitySpotCheckins(database.db,owner,'beijing')).toEqual([{spotId:'beijing-01',markedAt:early},{spotId:'beijing-02',markedAt:late}]);
    expect(await hasGuestLibrary(database.db)).toBe(false);
    await clearMemories(database.db,owner);
    expect(await listCitySpotCheckins(database.db,owner,'beijing')).toHaveLength(2);
  } finally { database.close(); }
});

it('does not silently succeed when SQLite refuses a save', async () => {
  const db={runAsync:async()=>{throw new Error('disk full');}} as unknown as SQLiteDatabase;
  await expect(setCitySpotCheckin(db,owner,'beijing','beijing-01',true)).rejects.toThrow('disk full');
});

it('rolls back guest check-in changes when migration cannot commit', async () => {
  const database=open(':memory:');
  try {
    await migrateDbIfNeeded(database.db);
    await setCitySpotCheckin(database.db,owner,'beijing','beijing-01',true,late);
    await setCitySpotCheckin(database.db,'guest','beijing','beijing-01',true,early);
    await database.db.execAsync("CREATE TRIGGER fail_choice BEFORE INSERT ON local_library_account_choices BEGIN SELECT RAISE(ABORT, 'blocked'); END;");
    await expect(migrateGuestLibraryToAccount(database.db,owner,{prepareFiles:async()=>({replacements:new Map(),commitCleanup:async()=>{},rollback:async()=>{}})})).rejects.toThrow('blocked');
    expect(await listCitySpotCheckins(database.db,owner,'beijing')).toEqual([{spotId:'beijing-01',markedAt:late}]);
    expect(await listCitySpotCheckins(database.db,'guest','beijing')).toEqual([{spotId:'beijing-01',markedAt:early}]);
  } finally { database.close(); }
});
