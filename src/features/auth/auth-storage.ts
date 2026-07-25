import * as SecureStore from "expo-secure-store";

import type { AuthenticatedAccountSession } from "../../services/backend/api-client";

const sessionKey = "onetapreality.auth-session.v1";
const rememberedEmailKey = "onetapreality.remembered-email.v1";

export async function loadAuthSession(): Promise<AuthenticatedAccountSession | null> {
  const value = await SecureStore.getItemAsync(sessionKey);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AuthenticatedAccountSession>;
    return typeof parsed.accessToken === "string" && typeof parsed.user?.id === "string" && typeof parsed.user.email === "string" && typeof parsed.user.isAdmin === "boolean"
      ? parsed as AuthenticatedAccountSession
      : null;
  } catch { return null; }
}

export function saveAuthSession(session: AuthenticatedAccountSession): Promise<void> {
  return SecureStore.setItemAsync(sessionKey, JSON.stringify(session));
}

export function clearAuthSession(): Promise<void> {
  return SecureStore.deleteItemAsync(sessionKey);
}

export async function loadRememberedEmail(): Promise<string | null> {
  const value = await SecureStore.getItemAsync(rememberedEmailKey);
  return value?.trim().toLowerCase() || null;
}

export function saveRememberedEmail(email: string): Promise<void> {
  return SecureStore.setItemAsync(rememberedEmailKey, email.trim().toLowerCase());
}

export function clearRememberedEmail(): Promise<void> {
  return SecureStore.deleteItemAsync(rememberedEmailKey);
}
