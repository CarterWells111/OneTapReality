import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded, saveMemory, getMemory, listMemories } from '../src/storage/memory-repository';
import { createGeographicCity, resolveCityEntry } from '../src/types/city';
import { createMemory } from '../src/features/memories/memory-factory';
import { getGlobalSearchEntries } from '../src/features/cities/global-map-search';
import { getGlobalPlaces, getInitialGlobalRegion } from '../src/features/cities/global-map-places';
import { getCityStats } from '../src/features/cities/city-stats';

describe('Global places through real SQLite', () => {
  it('preserves a custom name, coordinates and photos after reload and keeps account isolation', async () => {
    const sqlite = new DatabaseSync(':memory:');
    const db = {
      execAsync: async (sql: string) => sqlite.exec(sql),
      runAsync: async (sql: string, ...args: (string | number | null)[]) => sqlite.prepare(sql).run(...args),
      getAllAsync: async (sql: string, ...args: (string | number | null)[]) => sqlite.prepare(sql).all(...args),
      getFirstAsync: async (sql: string, ...args: (string | number | null)[]) => sqlite.prepare(sql).get(...args) ?? null,
      withTransactionAsync: async (fn: () => Promise<void>) => {
        sqlite.exec('BEGIN');
        try { await fn(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
      },
    } as unknown as SQLiteDatabase;
    try {
      await migrateDbIfNeeded(db);
      const city = createGeographicCity({ name: '海边 / Sydney 🌊', latitude: -33.8688, longitude: 151.2093 });
      const memory = createMemory({ id: 'global-album', now: '2026-10-07T12:00:00Z', input: { title: 'Our trip', city, travelDate: '2026-10-01', photoUris: ['file:///local-photo.jpg'] }, pages: [{ id: 'page-global', position: 0, kind: 'photo', headline: 'Day one', body: 'A local photo', photoUri: 'file:///local-photo.jpg' }] });
      await saveMemory(db, memory, 'guest');
      await migrateDbIfNeeded(db);
      const loaded = await getMemory(db, memory.id, 'guest');
      expect(loaded).toMatchObject({ city, photoUris: memory.photoUris, pages: [{ headline: 'Day one' }] });
      expect(resolveCityEntry(loaded!.city)).toMatchObject({ name: '海边 / Sydney 🌊', geographic: { latitude: -33.8688, longitude: 151.2093 } });
      expect(await getMemory(db, memory.id, 'account:other@example.com')).toBeNull();
      const stats = getCityStats(await listMemories(db, 'guest'));
      expect(getGlobalPlaces(stats).find(p => p.city === city)?.longitude).toBe(151.2093);
      expect(getGlobalSearchEntries([city]).find(p => p.id === city)?.terms).toContain('sydney');
      expect(getInitialGlobalRegion(stats)).toMatchObject({ latitude: -33.8688, longitude: expect.closeTo(151.2093, 4) });
    } finally { sqlite.close(); }
  });
});
