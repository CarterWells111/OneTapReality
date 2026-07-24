import * as SecureStore from "expo-secure-store";

const key = "onetapreality.pending-gift-card.v1";

export type PendingGiftCard = {
  cardId: string;
  cardCode: string;
  giftUrl: string;
  expiresAt: string;
  writeVerified?: boolean;
};

export async function loadPendingGiftCard(): Promise<PendingGiftCard | null> {
  const value = await SecureStore.getItemAsync(key);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as PendingGiftCard;
    return parsed.cardId && parsed.cardCode && parsed.giftUrl && parsed.expiresAt ? parsed : null;
  } catch {
    return null;
  }
}

export function savePendingGiftCard(card: PendingGiftCard): Promise<void> {
  return SecureStore.setItemAsync(key, JSON.stringify(card));
}

export function clearPendingGiftCard(): Promise<void> {
  return SecureStore.deleteItemAsync(key);
}
