import * as SecureStore from "expo-secure-store";

const INSTALLATION_ID_KEY = "adventurex.backend.installation-id.v1";
const ACCESS_TOKEN_KEY = "adventurex.backend.access-token.v1";

function createInstallationId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `install-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function loadOrCreateInstallationId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(INSTALLATION_ID_KEY);
  if (existing) return existing;
  const installationId = createInstallationId();
  await SecureStore.setItemAsync(INSTALLATION_ID_KEY, installationId);
  return installationId;
}

export function loadAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export function saveAccessToken(accessToken: string): Promise<void> {
  return SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
}
