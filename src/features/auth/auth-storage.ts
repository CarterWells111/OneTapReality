import * as SecureStore from "expo-secure-store";

import type { AuthenticatedAccountSession } from "../../services/backend/api-client";

const key = "onetapreality.auth-session.v1";

export async function loadAuthSession(): Promise<AuthenticatedAccountSession | null> {
  const value = await SecureStore.getItemAsync(key);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AuthenticatedAccountSession>;
    return typeof parsed.accessToken === "string" && typeof parsed.user?.id === "string" && typeof parsed.user.email === "string" && typeof parsed.user.isAdmin === "boolean"
      ? parsed as AuthenticatedAccountSession
      : null;
  } catch { return null; }
}

export function saveAuthSession(session: AuthenticatedAccountSession): Promise<void> {
  return SecureStore.setItemAsync(key, JSON.stringify(session));
}

export function clearAuthSession(): Promise<void> {
  return SecureStore.deleteItemAsync(key);
}
