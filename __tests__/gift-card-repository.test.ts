import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";
import { claimGiftByTokenHash, createInitializingGiftCard, expireGiftCardReservations, activateGiftCard, getGiftCardDetails, listGiftCards, retireGiftCard, updateGiftCardMetadata } from "../src/server/gifts/repository";

describe("developer NFC card inventory", () => {
  it("assigns unique display numbers during concurrent initialization", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      const created = await Promise.all(Array.from({ length: 8 }, (_, index) => createInitializingGiftCard(db, {
        cardId: `concurrent-card-${index}`,
        cardCode: `CARD-CONCURRENT-${index}`,
        giftId: `concurrent-gift-${index}`,
        tokenHash: `concurrent-token-${index}`,
        note: null,
        adminEmail: "dev@example.com",
        createdAt: "2026-07-24T00:00:00.000Z",
        expiresAt: "2026-07-24T00:15:00.000Z",
      })));
      expect(new Set(created.map((card) => card.displayNumber)).size).toBe(8);
      expect(created.map((card) => card.displayNumber).sort((left, right) => left - right)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    } finally {
      await close();
    }
  });

  it("keeps a reserved card unclaimable until native writing is confirmed", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await expect(createInitializingGiftCard(db, {
        cardId: "card-1", cardCode: "CARD-000001", giftId: "gift-1", tokenHash: "gift-token", note: "July batch", adminEmail: "dev@example.com",
        createdAt: "2026-07-24T00:00:00.000Z", expiresAt: "2026-07-24T00:15:00.000Z",
      })).resolves.toEqual({ displayNumber: 1 });

      await expect(claimGiftByTokenHash(db, "gift-token", "owner@example.com", "2026-07-24T00:01:00.000Z")).resolves.toBeNull();
      await expect(activateGiftCard(db, "card-1", "dev@example.com", "2026-07-24T00:02:00.000Z")).resolves.toBe(true);
      await expect(claimGiftByTokenHash(db, "gift-token", "owner@example.com", "2026-07-24T00:03:00.000Z")).resolves.toEqual(expect.objectContaining({ id: "gift-1" }));
      await expect(listGiftCards(db)).resolves.toEqual([expect.objectContaining({ displayNumber: 1, name: null, state: "active", note: "July batch" })]);
      expect(JSON.stringify(await listGiftCards(db))).not.toContain("CARD-000001");
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

      await updateGiftCardMetadata(db, "card-1", { name: " July launch " }, "DEV@example.com", "2026-07-24T00:01:30.000Z");
      await expect(listGiftCards(db, { state: "active", search: "launch" })).resolves.toEqual([
        expect.objectContaining({ id: "card-1", giftStatus: "unclaimed" }),
      ]);
      await expect(getGiftCardDetails(db, "card-1")).resolves.toEqual(expect.objectContaining({
        card: expect.objectContaining({ displayNumber: 1, name: "July launch", giftStatus: "unclaimed" }),
        events: expect.arrayContaining([expect.objectContaining({ kind: "metadata_updated", metadata: { fields: ["name"] } })]),
      }));
      await expect(retireGiftCard(db, "card-1", "dev@example.com", "2026-07-24T00:02:00.000Z")).resolves.toBe(true);
      await expect(retireGiftCard(db, "card-1", "dev@example.com", "2026-07-24T00:03:00.000Z")).resolves.toBe(false);
      await expect(getGiftCardDetails(db, "card-1")).resolves.toEqual(expect.objectContaining({
        card: expect.objectContaining({ state: "retired", giftStatus: "disabled" }),
        events: expect.arrayContaining([expect.objectContaining({ kind: "retired" })]),
      }));
    } finally { await close(); }
  });

  it("sorts by permanent display number and edits metadata for every card state", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      for (const [index, state] of ["initializing", "active", "retired"].entries()) {
        await createInitializingGiftCard(db, {
          cardId: `card-${index + 1}`, cardCode: `CARD-${index + 1}`, giftId: `gift-${index + 1}`, tokenHash: `token-${index + 1}`, note: null, adminEmail: "dev@example.com",
          createdAt: `2026-07-24T00:0${index}:00.000Z`, expiresAt: "2026-07-24T00:15:00.000Z",
        });
        if (state === "active" || state === "retired") await activateGiftCard(db, `card-${index + 1}`, "dev@example.com", "2026-07-24T00:10:00.000Z");
        if (state === "retired") await retireGiftCard(db, `card-${index + 1}`, "dev@example.com", "2026-07-24T00:11:00.000Z");
        await expect(updateGiftCardMetadata(db, `card-${index + 1}`, { name: ` Card ${index + 1} `, note: " " }, "DEV@example.com", "2026-07-24T00:12:00.000Z")).resolves.toEqual(expect.objectContaining({ name: `Card ${index + 1}`, note: null }));
      }
      await expect(listGiftCards(db)).resolves.toEqual([
        expect.objectContaining({ displayNumber: 1, name: "Card 1" }),
        expect.objectContaining({ displayNumber: 2, name: "Card 2" }),
        expect.objectContaining({ displayNumber: 3, name: "Card 3" }),
      ]);
      await expect(listGiftCards(db, { search: "2" })).resolves.toEqual([
        expect.objectContaining({ displayNumber: 2, name: "Card 2" }),
      ]);
      await expect(listGiftCards(db, { search: "CARD-" })).resolves.toEqual([]);
    } finally { await close(); }
  });
});
