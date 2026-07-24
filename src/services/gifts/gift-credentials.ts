import * as SecureStore from "expo-secure-store";

const key = "onetapreality.gift-session.v1";
export type GiftSession = { accessToken: string; email: string };

export async function loadGiftSession(): Promise<GiftSession | null> {
  const value = await SecureStore.getItemAsync(key);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as GiftSession;
    return parsed.accessToken && parsed.email ? parsed : null;
  } catch { return null; }
}

export function saveGiftSession(session: GiftSession): Promise<void> { return SecureStore.setItemAsync(key, JSON.stringify(session)); }
export function clearGiftSession(): Promise<void> { return SecureStore.deleteItemAsync(key); }
