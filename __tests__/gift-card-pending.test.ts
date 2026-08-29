const mockSecureValues = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureValues.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureValues.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureValues.delete(key);
  }),
}));

import {
  clearPendingGiftCard,
  loadPendingGiftCard,
  markPendingGiftCardWriteVerified,
  savePendingGiftCard,
} from "../src/services/gifts/gift-card-pending";

const secureStore = jest.requireMock("expo-secure-store") as {
  deleteItemAsync: jest.Mock;
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
};

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function reservation(operationId: string, cardId = operationId) {
  return {
    ownerUserId: "user-1",
    operationId,
    revision: 1,
    cardId,
    cardCode: `CARD-${cardId}`,
    giftUrl: "https://onetapreality.com/gift/unique-token",
    expiresAt: "2026-07-24T00:15:00.000Z",
  };
}

describe("pending gift card activation", () => {
  beforeEach(() => {
    mockSecureValues.clear();
    secureStore.getItemAsync.mockReset().mockImplementation(
      async (key: string) => mockSecureValues.get(key) ?? null,
    );
    secureStore.setItemAsync.mockReset().mockImplementation(
      async (key: string, value: string) => { mockSecureValues.set(key, value); },
    );
    secureStore.deleteItemAsync.mockReset().mockImplementation(
      async (key: string) => { mockSecureValues.delete(key); },
    );
  });

  it("isolates the exact reservation by owner without persisting an access token", async () => {
    const saved = reservation("operation-1", "card-2");

    await expect(savePendingGiftCard("user-1", saved)).resolves.toBe(true);
    await expect(loadPendingGiftCard("user-1")).resolves.toEqual(saved);
    await expect(loadPendingGiftCard("user-2")).resolves.toBeNull();
    await expect(clearPendingGiftCard("user-2", "operation-1")).resolves.toBe(false);
    await expect(loadPendingGiftCard("user-1")).resolves.toEqual(saved);
    await expect(clearPendingGiftCard("user-1", "operation-1")).resolves.toBe(true);
    await expect(loadPendingGiftCard("user-1")).resolves.toBeNull();
    expect(JSON.stringify(saved)).not.toContain("access-token");
  });

  it("serializes same-owner saves and rejects a newer conflicting reservation", async () => {
    const firstWrite = deferred();
    secureStore.setItemAsync.mockImplementationOnce(async (key: string, value: string) => {
      await firstWrite.promise;
      mockSecureValues.set(key, value);
    });
    const oldReservation = reservation("old-operation", "old-card");
    const newReservation = reservation("new-operation", "new-card");

    const oldSave = savePendingGiftCard("user-1", oldReservation);
    await waitForMockCall(secureStore.setItemAsync);
    const newSave = savePendingGiftCard("user-1", newReservation);
    firstWrite.resolve();

    await expect(oldSave).resolves.toBe(true);
    await expect(newSave).resolves.toBe(false);
    await expect(loadPendingGiftCard("user-1")).resolves.toEqual(oldReservation);
  });

  it("queues a same-owner create behind an old conditional delete", async () => {
    const oldReservation = reservation("old-operation", "old-card");
    await savePendingGiftCard("user-1", oldReservation);
    const deletion = deferred();
    secureStore.deleteItemAsync.mockImplementationOnce(async (key: string) => {
      await deletion.promise;
      mockSecureValues.delete(key);
    });

    const oldClear = clearPendingGiftCard("user-1", oldReservation.operationId);
    await waitForMockCall(secureStore.deleteItemAsync);
    const newReservation = reservation("new-operation", "new-card");
    const newSave = savePendingGiftCard("user-1", newReservation);
    deletion.resolve();

    await expect(oldClear).resolves.toBe(true);
    await expect(newSave).resolves.toBe(true);
    await expect(loadPendingGiftCard("user-1")).resolves.toEqual(newReservation);
  });

  it("never lets a late writer repair overwrite another operation", async () => {
    const newReservation = reservation("new-operation", "new-card");
    await savePendingGiftCard("user-1", newReservation);

    await expect(
      markPendingGiftCardWriteVerified("user-1", "old-operation"),
    ).resolves.toBeNull();
    await expect(loadPendingGiftCard("user-1")).resolves.toEqual(newReservation);

    await expect(
      markPendingGiftCardWriteVerified("user-1", newReservation.operationId),
    ).resolves.toEqual({
      ...newReservation,
      revision: 2,
      writeVerified: true,
    });
  });
});

async function waitForMockCall(mock: jest.Mock) {
  for (let attempt = 0; attempt < 20 && mock.mock.calls.length === 0; attempt += 1) {
    await Promise.resolve();
  }
  expect(mock).toHaveBeenCalled();
}
