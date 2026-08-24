import { useSQLiteContext } from "expo-sqlite";
import * as React from "react";

import { useAuth } from "./auth-provider";
import {
  chooseGuestLibrary,
  getLocalLibrarySelection,
  hasGuestLibrary,
  migrateGuestLibraryToAccount,
} from "./guest-library-migration";
import {
  accountLocalLibraryOwner,
  GUEST_LIBRARY_OWNER,
  type AccountLocalLibraryOwner,
  type LocalLibraryOwner,
} from "./local-library-owner";

type LocalLibraryContextValue = {
  owner: LocalLibraryOwner;
  isReady: boolean;
  isMigrating: boolean;
  needsMigrationChoice: boolean;
  accountOwner: AccountLocalLibraryOwner | null;
  continueWithGuest: () => Promise<void>;
  migrateToAccount: () => Promise<void>;
};

const LocalLibraryContext = React.createContext<LocalLibraryContextValue | null>(null);

export function LocalLibraryProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const { isAuthReady, user } = useAuth();
  const accountOwner = user ? accountLocalLibraryOwner(user.email) : null;
  const [owner, setOwner] = React.useState<LocalLibraryOwner>(GUEST_LIBRARY_OWNER);
  const [isReady, setReady] = React.useState(false);
  const [isMigrating, setMigrating] = React.useState(false);
  const [needsMigrationChoice, setNeedsMigrationChoice] = React.useState(false);
  const generation = React.useRef(0);
  const currentAccountOwner = React.useRef<AccountLocalLibraryOwner | null>(accountOwner);
  currentAccountOwner.current = accountOwner;

  React.useEffect(() => {
    const requestedGeneration = ++generation.current;
    setNeedsMigrationChoice(false);
    setMigrating(false);
    if (!isAuthReady) {
      setReady(false);
      return;
    }
    if (!accountOwner) {
      setOwner(GUEST_LIBRARY_OWNER);
      setReady(true);
      return;
    }

    setReady(false);
    void Promise.all([
      getLocalLibrarySelection(db, accountOwner),
      hasGuestLibrary(db),
    ]).then(([selection, guestExists]) => {
      if (requestedGeneration !== generation.current || currentAccountOwner.current !== accountOwner) return;
      if (selection === "guest") {
        setOwner(GUEST_LIBRARY_OWNER);
      } else if (selection === "account" || !guestExists) {
        setOwner(accountOwner);
      } else {
        // Safe default: a login never claims or moves guest data implicitly.
        setOwner(GUEST_LIBRARY_OWNER);
        setNeedsMigrationChoice(true);
      }
    }).catch(() => {
      if (requestedGeneration !== generation.current || currentAccountOwner.current !== accountOwner) return;
      // A local metadata read failure must not expose another account's library.
      setOwner(GUEST_LIBRARY_OWNER);
      setNeedsMigrationChoice(true);
    }).finally(() => {
      if (requestedGeneration === generation.current && currentAccountOwner.current === accountOwner) {
        setReady(true);
      }
    });
  }, [accountOwner, db, isAuthReady]);

  const continueWithGuest = React.useCallback(async () => {
    const requestedOwner = currentAccountOwner.current;
    if (!requestedOwner) throw new Error("请先登录后选择本机旅行册");
    const requestedGeneration = generation.current;
    setMigrating(true);
    try {
      await chooseGuestLibrary(db, requestedOwner);
      if (requestedGeneration === generation.current && currentAccountOwner.current === requestedOwner) {
        setOwner(GUEST_LIBRARY_OWNER);
        setNeedsMigrationChoice(false);
      }
    } finally {
      if (requestedGeneration === generation.current && currentAccountOwner.current === requestedOwner) {
        setMigrating(false);
      }
    }
  }, [db]);

  const migrateToAccount = React.useCallback(async () => {
    const requestedOwner = currentAccountOwner.current;
    if (!requestedOwner) throw new Error("请先登录后迁移本机旅行册");
    const requestedGeneration = generation.current;
    setMigrating(true);
    try {
      await migrateGuestLibraryToAccount(db, requestedOwner);
      if (requestedGeneration === generation.current && currentAccountOwner.current === requestedOwner) {
        setOwner(requestedOwner);
        setNeedsMigrationChoice(false);
      }
    } finally {
      if (requestedGeneration === generation.current && currentAccountOwner.current === requestedOwner) {
        setMigrating(false);
      }
    }
  }, [db]);

  return (
    <LocalLibraryContext.Provider value={{
      accountOwner,
      continueWithGuest,
      isMigrating,
      isReady,
      migrateToAccount,
      needsMigrationChoice,
      owner,
    }}>
      {children}
    </LocalLibraryContext.Provider>
  );
}

export function useLocalLibrary(): LocalLibraryContextValue {
  const context = React.useContext(LocalLibraryContext);
  if (!context) throw new Error("useLocalLibrary must be used inside LocalLibraryProvider");
  return context;
}
