import Storage from "expo-sqlite/kv-store";

import { DEFAULT_LOCAL_PROFILE, normalizeNickname, type LocalProfile } from "./local-profile";

const LOCAL_PROFILE_KEY = "luyi.local-profile.v1";

function defaultLocalProfile(): LocalProfile {
  return { ...DEFAULT_LOCAL_PROFILE };
}

export async function loadLocalProfile(): Promise<LocalProfile> {
  const value = await Storage.getItemAsync(LOCAL_PROFILE_KEY);

  if (!value) {
    return defaultLocalProfile();
  }

  try {
    const profile: unknown = JSON.parse(value);

    if (!profile || typeof profile !== "object") {
      return defaultLocalProfile();
    }

    const storedProfile = profile as Partial<LocalProfile>;
    return {
      nickname: normalizeNickname(
        typeof storedProfile.nickname === "string" ? storedProfile.nickname : "",
      ),
      avatarUri: typeof storedProfile.avatarUri === "string" ? storedProfile.avatarUri : null,
    };
  } catch {
    return defaultLocalProfile();
  }
}

export async function saveLocalProfile(profile: LocalProfile): Promise<void> {
  const normalizedProfile: LocalProfile = {
    nickname: normalizeNickname(profile.nickname),
    avatarUri: profile.avatarUri,
  };

  await Storage.setItemAsync(LOCAL_PROFILE_KEY, JSON.stringify(normalizedProfile));
}
