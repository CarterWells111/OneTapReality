import { useSQLiteContext } from "expo-sqlite";
import * as React from "react";

import { useAuth } from "./auth-provider";
import {
  chooseAccountLibrary,
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
import { acquireLocalLibraryWriteLease } from "./local-library-write-lease";

type LocalLibraryContextValue = {
  owner: LocalLibraryOwner;
  isReady: boolean;
  isMigrating: boolean;
  needsMigrationChoice: boolean;
  accountOwner: AccountLocalLibraryOwner | null;
  continueWithGuest: () => Promise<void>;
  migrateToAccount: () => Promise<void>;
  switchToAccount: () => Promise<void>;
  runWrite: <T>(operation: (
    owner: LocalLibraryOwner,
    assertActive: () => void,
  ) => Promise<T>) => Promise<T>;
};

type LibraryResolution = {
  accountOwner: AccountLocalLibraryOwner | null;
  authGeneration: number;
  owner: LocalLibraryOwner;
  status: "loading" | "choice" | "ready";
};

const LocalLibraryContext = React.createContext<LocalLibraryContextValue | null>(null);
const defaultSessionGeneration = () => 0;

export function LocalLibraryProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const auth = useAuth();
  const { isAuthReady, user } = auth;
  const getSessionGeneration = auth.getSessionGeneration ?? defaultSessionGeneration;
  const authGeneration = auth.sessionGeneration ?? getSessionGeneration();
  const accountOwner = user ? accountLocalLibraryOwner(user.email) : null;
  const [resolution, setResolution] = React.useState<LibraryResolution>({
    accountOwner: null,
    authGeneration,
    owner: GUEST_LIBRARY_OWNER,
    status: "loading",
  });
  const [isMigrating, setMigrating] = React.useState(false);
  const generation = React.useRef(0);
  const currentAccountOwner = React.useRef<AccountLocalLibraryOwner | null>(accountOwner);
  const currentAuthGeneration = React.useRef(authGeneration);
  currentAccountOwner.current = accountOwner;
  currentAuthGeneration.current = authGeneration;

  const resolutionMatches = resolution.accountOwner === accountOwner
    && resolution.authGeneration === authGeneration;
  const owner = resolutionMatches ? resolution.owner : GUEST_LIBRARY_OWNER;
  const needsMigrationChoice = resolutionMatches && resolution.status === "choice";
  const isReady = resolutionMatches && resolution.status === "ready" && !isMigrating;
  const writeToken = resolutionMatches
    ? `${authGeneration}\0${accountOwner ?? "signed-out"}\0${owner}\0${resolution.status}\0${isMigrating ? "migrating" : "idle"}`
    : `${authGeneration}\0${accountOwner ?? "signed-out"}\0pending`;
  const liveState = React.useRef({ authGeneration, isReady, needsMigrationChoice, owner, writeToken });
  liveState.current = { authGeneration, isReady, needsMigrationChoice, owner, writeToken };

  React.useEffect(() => {
    const requestedGeneration = ++generation.current;
    setMigrating(false);
    setResolution({
      accountOwner,
      authGeneration,
      owner: GUEST_LIBRARY_OWNER,
      status: "loading",
    });
    if (!isAuthReady) {
      return;
    }
    if (!accountOwner) {
      setResolution({
        accountOwner: null,
        authGeneration,
        owner: GUEST_LIBRARY_OWNER,
        status: "ready",
      });
      return;
    }

    void Promise.all([
      getLocalLibrarySelection(db, accountOwner),
      hasGuestLibrary(db),
    ]).then(([selection, guestExists]) => {
      if (requestedGeneration !== generation.current
        || currentAccountOwner.current !== accountOwner
        || currentAuthGeneration.current !== authGeneration) return;
      if (selection === "guest") {
        setResolution({ accountOwner, authGeneration, owner: GUEST_LIBRARY_OWNER, status: "ready" });
      } else if (selection === "account" || !guestExists) {
        setResolution({ accountOwner, authGeneration, owner: accountOwner, status: "ready" });
      } else {
        // Safe default: a login never claims or moves guest data implicitly.
        setResolution({ accountOwner, authGeneration, owner: GUEST_LIBRARY_OWNER, status: "choice" });
      }
    }).catch(() => {
      if (requestedGeneration !== generation.current
        || currentAccountOwner.current !== accountOwner
        || currentAuthGeneration.current !== authGeneration) return;
      // A local metadata read failure must not expose another account's library.
      setResolution({ accountOwner, authGeneration, owner: GUEST_LIBRARY_OWNER, status: "choice" });
    });
  }, [accountOwner, authGeneration, db, isAuthReady]);

  const continueWithGuest = React.useCallback(async () => {
    const requestedOwner = currentAccountOwner.current;
    if (!requestedOwner) throw new Error("请先登录后选择本机旅行册");
    const requestedGeneration = generation.current;
    const requestedAuthGeneration = currentAuthGeneration.current;
    setMigrating(true);
    try {
      await chooseGuestLibrary(db, requestedOwner);
      if (requestedGeneration === generation.current
        && currentAccountOwner.current === requestedOwner
        && currentAuthGeneration.current === requestedAuthGeneration) {
        setResolution({
          accountOwner: requestedOwner,
          authGeneration: requestedAuthGeneration,
          owner: GUEST_LIBRARY_OWNER,
          status: "ready",
        });
      }
    } finally {
      if (requestedGeneration === generation.current
        && currentAccountOwner.current === requestedOwner
        && currentAuthGeneration.current === requestedAuthGeneration) {
        setMigrating(false);
      }
    }
  }, [db]);

  const migrateToAccount = React.useCallback(async () => {
    const requestedOwner = currentAccountOwner.current;
    if (!requestedOwner) throw new Error("请先登录后迁移本机旅行册");
    const requestedGeneration = generation.current;
    const requestedAuthGeneration = currentAuthGeneration.current;
    setMigrating(true);
    try {
      await migrateGuestLibraryToAccount(db, requestedOwner);
      if (requestedGeneration === generation.current
        && currentAccountOwner.current === requestedOwner
        && currentAuthGeneration.current === requestedAuthGeneration) {
        setResolution({
          accountOwner: requestedOwner,
          authGeneration: requestedAuthGeneration,
          owner: requestedOwner,
          status: "ready",
        });
      }
    } finally {
      if (requestedGeneration === generation.current
        && currentAccountOwner.current === requestedOwner
        && currentAuthGeneration.current === requestedAuthGeneration) {
        setMigrating(false);
      }
    }
  }, [db]);

  const switchToAccount = React.useCallback(async () => {
    const requestedOwner = currentAccountOwner.current;
    if (!requestedOwner) throw new Error("请先登录后切换本机旅行册");
    const requestedGeneration = generation.current;
    const requestedAuthGeneration = currentAuthGeneration.current;
    setMigrating(true);
    try {
      await chooseAccountLibrary(db, requestedOwner);
      if (requestedGeneration === generation.current
        && currentAccountOwner.current === requestedOwner
        && currentAuthGeneration.current === requestedAuthGeneration) {
        setResolution({
          accountOwner: requestedOwner,
          authGeneration: requestedAuthGeneration,
          owner: requestedOwner,
          status: "ready",
        });
      }
    } finally {
      if (requestedGeneration === generation.current
        && currentAccountOwner.current === requestedOwner
        && currentAuthGeneration.current === requestedAuthGeneration) {
        setMigrating(false);
      }
    }
  }, [db]);

  const runWrite = React.useCallback(async <T,>(operation: (
    requestedOwner: LocalLibraryOwner,
    assertActive: () => void,
  ) => Promise<T>): Promise<T> => {
    const requested = { authGeneration, isReady, needsMigrationChoice, owner, writeToken };
    const assertActive = () => {
      const current = liveState.current;
      if (getSessionGeneration() !== requested.authGeneration
        || current.authGeneration !== requested.authGeneration
        || current.owner !== requested.owner
        || current.writeToken !== requested.writeToken) {
        throw new Error("本机旅行册已经切换，请重新操作");
      }
      if (!current.isReady || current.needsMigrationChoice) {
        throw new Error("本机旅行册仍在准备中");
      }
    };
    const lease = acquireLocalLibraryWriteLease(db, requested.owner, assertActive);
    try {
      const result = await operation(requested.owner, lease.assertActive);
      lease.assertActive();
      return result;
    } finally {
      lease.release();
    }
  }, [authGeneration, db, getSessionGeneration, isReady, needsMigrationChoice, owner, writeToken]);

  return (
    <LocalLibraryContext.Provider value={{
      accountOwner,
      continueWithGuest,
      isMigrating,
      isReady,
      migrateToAccount,
      needsMigrationChoice,
      owner,
      runWrite,
      switchToAccount,
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
