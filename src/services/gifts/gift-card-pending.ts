import * as SecureStore from "expo-secure-store";

const keyPrefix = "onetapreality.pending-gift-card.v2";
const ownerQueues = new Map<string, Promise<void>>();

export type PendingGiftCard = {
  ownerUserId: string;
  operationId: string;
  revision: number;
  cardId: string;
  cardCode: string;
  giftUrl: string;
  expiresAt: string;
  writeVerified?: boolean;
};

function ownerKey(ownerUserId: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(ownerUserId)) {
    throw new Error("Pending gift card owner is invalid.");
  }
  return `${keyPrefix}.${ownerUserId}`;
}

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 256
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function normalizePendingGiftCard(
  value: unknown,
  expectedOwnerUserId: string,
): PendingGiftCard | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PendingGiftCard>;
  const revision = candidate.revision;
  if (
    candidate.ownerUserId !== expectedOwnerUserId
    || !isSafeIdentifier(candidate.operationId)
    || typeof revision !== "number"
    || !Number.isSafeInteger(revision)
    || revision < 1
    || !isSafeIdentifier(candidate.cardId)
    || !isSafeIdentifier(candidate.cardCode)
    || typeof candidate.giftUrl !== "string"
    || candidate.giftUrl.length === 0
    || typeof candidate.expiresAt !== "string"
    || candidate.expiresAt.length === 0
    || (candidate.writeVerified !== undefined && typeof candidate.writeVerified !== "boolean")
  ) return null;

  return {
    ownerUserId: candidate.ownerUserId,
    operationId: candidate.operationId,
    revision,
    cardId: candidate.cardId,
    cardCode: candidate.cardCode,
    giftUrl: candidate.giftUrl,
    expiresAt: candidate.expiresAt,
    ...(candidate.writeVerified === true ? { writeVerified: true } : {}),
  };
}

async function readPendingGiftCard(
  key: string,
  ownerUserId: string,
): Promise<PendingGiftCard | null> {
  const value = await SecureStore.getItemAsync(key);
  if (!value) return null;
  try {
    return normalizePendingGiftCard(JSON.parse(value), ownerUserId);
  } catch {
    return null;
  }
}

function withOwnerQueue<T>(
  ownerUserId: string,
  operation: (key: string) => Promise<T>,
): Promise<T> {
  const key = ownerKey(ownerUserId);
  const previous = ownerQueues.get(key) ?? Promise.resolve();
  const result = previous
    .catch(() => undefined)
    .then(() => operation(key));
  const tail = result.then(() => undefined, () => undefined);
  ownerQueues.set(key, tail);
  return result.finally(() => {
    if (ownerQueues.get(key) === tail) ownerQueues.delete(key);
  });
}

function sameReservation(left: PendingGiftCard, right: PendingGiftCard): boolean {
  return left.ownerUserId === right.ownerUserId
    && left.operationId === right.operationId
    && left.revision === right.revision
    && left.cardId === right.cardId
    && left.cardCode === right.cardCode
    && left.giftUrl === right.giftUrl
    && left.expiresAt === right.expiresAt
    && left.writeVerified === right.writeVerified;
}

export async function loadPendingGiftCard(
  ownerUserId: string,
): Promise<PendingGiftCard | null> {
  return withOwnerQueue(ownerUserId, (key) => readPendingGiftCard(key, ownerUserId));
}

export function savePendingGiftCard(
  ownerUserId: string,
  card: PendingGiftCard,
): Promise<boolean> {
  if (card.ownerUserId !== ownerUserId) {
    throw new Error("Pending gift card owner mismatch.");
  }
  const normalized = normalizePendingGiftCard(card, ownerUserId);
  if (!normalized) throw new Error("Pending gift card reservation is invalid.");
  return withOwnerQueue(ownerUserId, async (key) => {
    const current = await readPendingGiftCard(key, ownerUserId);
    if (current) return sameReservation(current, normalized);
    await SecureStore.setItemAsync(key, JSON.stringify(normalized));
    return true;
  });
}

export function clearPendingGiftCard(
  ownerUserId: string,
  operationId: string,
): Promise<boolean> {
  if (!isSafeIdentifier(operationId)) {
    throw new Error("Pending gift card operation is invalid.");
  }
  return withOwnerQueue(ownerUserId, async (key) => {
    const current = await readPendingGiftCard(key, ownerUserId);
    if (!current || current.operationId !== operationId) return false;
    await SecureStore.deleteItemAsync(key);
    return true;
  });
}

export function markPendingGiftCardWriteVerified(
  ownerUserId: string,
  operationId: string,
): Promise<PendingGiftCard | null> {
  if (!isSafeIdentifier(operationId)) {
    throw new Error("Pending gift card operation is invalid.");
  }
  return withOwnerQueue(ownerUserId, async (key) => {
    const current = await readPendingGiftCard(key, ownerUserId);
    if (!current || current.operationId !== operationId) return null;
    if (current.writeVerified) return current;
    const verified: PendingGiftCard = {
      ...current,
      revision: current.revision + 1,
      writeVerified: true,
    };
    await SecureStore.setItemAsync(key, JSON.stringify(verified));
    return verified;
  });
}
