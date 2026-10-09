import type { SQLiteDatabase } from 'expo-sqlite';
import { isLocalLibraryOwner, type LocalLibraryOwner } from '../features/auth/local-library-owner';
import { getCityCheckinSpots } from '../features/cities/city-checkin-spots';

export type CitySpotCheckin = { spotId: string; markedAt: string };
export const citySpotCheckinSchema = `CREATE TABLE IF NOT EXISTS city_spot_checkins (
  ownerAccountKey TEXT NOT NULL,
  cityId TEXT NOT NULL,
  spotId TEXT NOT NULL,
  markedAt TEXT NOT NULL,
  PRIMARY KEY (ownerAccountKey, cityId, spotId)
);`;
function assertOwner(owner: LocalLibraryOwner) {
  if (!isLocalLibraryOwner(owner)) throw new Error('Invalid check-in library owner');
}
export async function listCitySpotCheckins(db: SQLiteDatabase, owner: LocalLibraryOwner, city: string): Promise<CitySpotCheckin[]> {
  assertOwner(owner);
  return db.getAllAsync<CitySpotCheckin>('SELECT spotId, markedAt FROM city_spot_checkins WHERE ownerAccountKey = ? AND cityId = ? ORDER BY spotId',owner,city);
}
export async function setCitySpotCheckin(db: SQLiteDatabase, owner: LocalLibraryOwner, city: string, spotId: string, visited: boolean, markedAt = new Date().toISOString()): Promise<void> {
  assertOwner(owner);
  if (!getCityCheckinSpots(city).some(s => s.spotId === spotId)) throw new Error('Unknown illustrated city spot');
  if (!visited) {
    await db.runAsync('DELETE FROM city_spot_checkins WHERE ownerAccountKey = ? AND cityId = ? AND spotId = ?',owner,city,spotId);
  } else {
    if (!Number.isFinite(Date.parse(markedAt))) throw new Error('Invalid check-in timestamp');
    await db.runAsync(`INSERT INTO city_spot_checkins (ownerAccountKey, cityId, spotId, markedAt) VALUES (?, ?, ?, ?)
      ON CONFLICT(ownerAccountKey, cityId, spotId) DO NOTHING`,owner,city,spotId,markedAt);
  }
}
