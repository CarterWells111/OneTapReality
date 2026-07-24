import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";
import { claimGiftByTokenHash, createInitializingGiftCard, expireGiftCardReservations, activateGiftCard, getGiftCardDetails, listGiftCards, retireGiftCard } from "../src/server/gifts/repository";

describe("developer NFC card inventory", () => {
  it("keeps a reserved card unclaimable until native writing is confirmed", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createInitializingGiftCard(db, {
        cardId: "card-1", cardCode: "CARD-000001", giftId: "gift-1", tokenHash: "gift-token", note: "July batch", adminEmail: "dev@example.com",
        createdAt: "2026-07-24T00:00:00.000Z", expiresAt: "2026-07-24T00:15:00.000Z",
      });

      await expect(claimGiftByTokenHash(db, "gift-token", "owner@example.com", "2026-07-24T00:01:00.000Z")).resolves.toBeNull();
      await expect(activateGiftCard(db, "card-1", "dev@example.com", "2026-07-24T00:02:00.000Z")).resolves.toBe(true);
      await expect(claimGiftByTokenHash(db, "gift-token", "owner@example.com", "2026-07-24T00:03:00.000Z")).resolves.toEqual(expect.objectContaining({ id: "gift-1" }));
      await expect(listGiftCards(db)).resolves.toEqual([expect.objectContaining({ code: "CARD-000001", state: "active", note: "July batch" })]);
    } finally { await close(); }
  });

  it("retires expired reservations before they can become active", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createInitializingGiftCard(db, {
        cardId: "card-1", cardCode: "CARD-000001", giftId: "gift-1", tokenHash: "gift-token", note: null, adminEmail: "dev@example.com",
        createdAt: "2026-07-24T00:00:00.000Z", expiresAt: "2026-07-24T00:15:00.000Z",
      });
      await expect(expireGiftCardReservations(db, "2026-07-24T00:15:00.000Z")).resolves.toBe(1);
      await expect(activateGiftCard(db, "card-1", "dev@example.com", "2026-07-24T00:15:00.000Z")).resolves.toBe(false);
      await expect(claimGiftByTokenHash(db, "gift-token", "owner@example.com", "2026-07-24T00:15:00.000Z")).resolves.toBeNull();
    } finally { await close(); }
  });

  it("filters inventory, returns its audit trail, and retires only unclaimed active cards", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createInitializingGiftCard(db, {
        cardId: "card-1", cardCode: "CARD-JULY", giftId: "gift-1", tokenHash: "gift-token", note: "July batch", adminEmail: "dev@example.com",
        createdAt: "2026-07-24T00:00:00.000Z", expiresAt: "2026-07-24T00:15:00.000Z",
      });
      await activateGiftCard(db, "card-1", "dev@example.com", "2026-07-24T00:01:00.000Z");

      await expect(listGiftCards(db, { state: "active", code: "july", note: "batch" })).resolves.toEqual([
        expect.objectContaining({ id: "card-1", giftStatus: "unclaimed" }),
      ]);
      await expect(getGiftCardDetails(db, "card-1")).resolves.toEqual(expect.objectContaining({
        card: expect.objectContaining({ code: "CARD-JULY", giftStatus: "unclaimed" }),
        events: expect.arrayContaining([expect.objectContaining({ kind: "initialization_started" }), expect.objectContaining({ kind: "activated" })]),
      }));
      await expect(retireGiftCard(db, "card-1", "dev@example.com", "2026-07-24T00:02:00.000Z")).resolves.toBe(true);
      await expect(retireGiftCard(db, "card-1", "dev@example.com", "2026-07-24T00:03:00.000Z")).resolves.toBe(false);
      await expect(getGiftCardDetails(db, "card-1")).resolves.toEqual(expect.objectContaining({
        card: expect.objectContaining({ state: "retired", giftStatus: "disabled" }),
        events: expect.arrayContaining([expect.objectContaining({ kind: "retired" })]),
      }));
    } finally { await close(); }
  });
});
