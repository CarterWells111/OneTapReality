import * as React from "react";

import { DEFAULT_LOCAL_PROFILE, type LocalProfile } from "./local-profile";
import { loadLocalProfile, saveLocalProfile } from "./profile-storage";

type ProfileContextValue = {
  profile: LocalProfile;
  isProfileReady: boolean;
  updateProfile: (next: LocalProfile) => Promise<void>;
};

const ProfileContext = React.createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = React.useState<LocalProfile>(DEFAULT_LOCAL_PROFILE);
  const [isProfileReady, setIsProfileReady] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;

    void loadLocalProfile()
      .then((nextProfile) => {
        if (isMounted) {
          setProfile(nextProfile);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (isMounted) {
          setIsProfileReady(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const updateProfile = React.useCallback(async (next: LocalProfile) => {
    await saveLocalProfile(next);
    const persistedProfile = await loadLocalProfile();
    setProfile(persistedProfile);
  }, []);

  const value = React.useMemo<ProfileContextValue>(
    () => ({ profile, isProfileReady, updateProfile }),
    [isProfileReady, profile, updateProfile],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const context = React.use(ProfileContext);

  if (!context) {
    throw new Error("useProfile must be used inside ProfileProvider");
  }

  return context;
}
