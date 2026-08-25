import * as React from "react";

import { BackendApiClient, type AuthenticatedAccountSession, type AuthenticatedAccountUser } from "../../services/backend/api-client";
import {
  clearAuthSession,
  clearRememberedEmail,
  loadAuthSession,
  loadRememberedEmail,
  saveAuthSession,
  saveRememberedEmail,
} from "./auth-storage";

export type AuthIdentityScope = Readonly<{
  accessToken: string;
  email: string;
  generation: number;
}>;

export type AuthCleanupResult = "applied" | "no-op";

type AuthContextValue = {
  isAuthReady: boolean;
  session: AuthenticatedAccountSession | null;
  user: AuthenticatedAccountUser | null;
  rememberedEmail: string | null;
  requestCode: (email: string) => Promise<{ email: string }>;
  verifyCode: (email: string, code: string) => Promise<AuthenticatedAccountSession>;
  signOut: (expectedIdentity?: AuthIdentityScope) => Promise<AuthCleanupResult>;
  switchAccount: (expectedIdentity?: AuthIdentityScope) => Promise<AuthCleanupResult>;
  forgetRememberedEmail: (expectedIdentity?: AuthIdentityScope) => Promise<AuthCleanupResult>;
  getSessionGeneration: () => number;
  sessionGeneration: number;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

type InvalidatedIdentity = {
  identity: AuthIdentityScope | null;
  invalidatedGeneration: number;
};

function sameIdentity(left: AuthIdentityScope | null, right: AuthIdentityScope): boolean {
  return left?.accessToken === right.accessToken
    && left.email.trim().toLowerCase() === right.email.trim().toLowerCase()
    && left.generation === right.generation;
}

function identityScopeKey(identity: AuthIdentityScope): string {
  return `${identity.generation}\u0000${identity.accessToken}\u0000${identity.email.trim().toLowerCase()}`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const client = React.useMemo(() => new BackendApiClient(), []);
  const [session, setSession] = React.useState<AuthenticatedAccountSession | null>(null);
  const [rememberedEmail, setRememberedEmail] = React.useState<string | null>(null);
  const [isAuthReady, setAuthReady] = React.useState(false);
  const operationGeneration = React.useRef(0);
  const [sessionGeneration, setSessionGeneration] = React.useState(0);
  const sessionRef = React.useRef<AuthenticatedAccountSession | null>(null);
  const rememberedEmailRef = React.useRef<string | null>(null);
  const invalidatedIdentity = React.useRef<InvalidatedIdentity | null>(null);
  const deletionCleanupTickets = React.useRef(new Map<string, AuthIdentityScope>());
  const storageTransitionTail = React.useRef<Promise<void>>(Promise.resolve());
  const runStorageTransition = React.useCallback((operation: () => Promise<void>): Promise<void> => {
    const pending = storageTransitionTail.current.then(operation);
    storageTransitionTail.current = pending.then(() => undefined, () => undefined);
    return pending;
  }, []);

  React.useEffect(() => {
    let active = true;
    const generation = operationGeneration.current;
    void Promise.all([
      loadRememberedEmail().catch(() => null),
      loadAuthSession().catch(() => null),
    ]).then(async ([savedEmail, savedSession]) => {
      if (!active || generation !== operationGeneration.current) return;
      rememberedEmailRef.current = savedEmail;
      setRememberedEmail(savedEmail);
      if (!savedSession) return;
      try {
        const user = await client.getCurrentAuthUser(savedSession.accessToken);
        const refreshed = { accessToken: savedSession.accessToken, user };
        if (active && generation === operationGeneration.current) {
          sessionRef.current = refreshed;
          setSession(refreshed);
        }
      } catch (error) {
        if (!active || generation !== operationGeneration.current) return;
        const status =
          typeof error === "object" && error !== null && "status" in error
            ? Number(error.status)
            : undefined;
        if (status === 401 || status === 403) {
          await runStorageTransition(async () => {
            if (!active || generation !== operationGeneration.current) return;
            await clearAuthSession();
          }).catch(() => undefined);
        } else {
          sessionRef.current = savedSession;
          setSession(savedSession);
        }
      }
    }).finally(() => {
      if (active) setAuthReady(true);
    });
    return () => { active = false; };
  }, [client, runStorageTransition]);

  const requestCode = React.useCallback((email: string) => client.requestAuthEmailCode(email), [client]);
  const verifyCode = React.useCallback(async (email: string, code: string) => {
    const generation = ++operationGeneration.current;
    invalidatedIdentity.current = null;
    setSessionGeneration(generation);
    // Hide and invalidate the previous account before the first asynchronous
    // boundary. Old local-library callbacks consult this same generation.
    sessionRef.current = null;
    setSession(null);
    await runStorageTransition(async () => {
      if (generation !== operationGeneration.current) return;
      await clearAuthSession();
    });
    if (generation !== operationGeneration.current) {
      throw new Error("Authentication changed during verification");
    }
    const verified = await client.verifyAuthEmailCode(email, code);
    if (generation !== operationGeneration.current) {
      throw new Error("Authentication changed during verification");
    }
    let savedForCurrentGeneration = false;
    await runStorageTransition(async () => {
      if (generation !== operationGeneration.current) return;
      await saveAuthSession(verified);
      if (generation !== operationGeneration.current) return;
      sessionRef.current = verified;
      setSession(verified);
      savedForCurrentGeneration = true;
    });
    if (!savedForCurrentGeneration || generation !== operationGeneration.current) {
      throw new Error("Authentication changed during verification");
    }
    await runStorageTransition(async () => {
      if (generation !== operationGeneration.current) return;
      await saveRememberedEmail(verified.user.email);
      if (generation !== operationGeneration.current) return;
      rememberedEmailRef.current = verified.user.email;
      setRememberedEmail(verified.user.email);
    }).catch(() => undefined);
    return verified;
  }, [client, runStorageTransition]);
  const signOut = React.useCallback(async (expectedIdentity?: AuthIdentityScope) => {
    const currentSession = sessionRef.current;
    const currentGeneration = operationGeneration.current;
    let invalidation = invalidatedIdentity.current;

    if (expectedIdentity) {
      deletionCleanupTickets.current.set(identityScopeKey(expectedIdentity), expectedIdentity);
      const currentIdentity = currentSession ? {
        accessToken: currentSession.accessToken,
        email: currentSession.user.email,
        generation: currentGeneration,
      } : null;
      const isCurrentIdentity = sameIdentity(currentIdentity, expectedIdentity);
      if (currentSession !== null && !isCurrentIdentity) return "no-op";
      if (isCurrentIdentity) {
        invalidation = {
          identity: expectedIdentity,
          invalidatedGeneration: currentGeneration + 1,
        };
        invalidatedIdentity.current = invalidation;
        operationGeneration.current = invalidation.invalidatedGeneration;
        setSessionGeneration(invalidation.invalidatedGeneration);
        sessionRef.current = null;
        setSession(null);
      }
    } else {
      const currentIdentity = currentSession ? {
        accessToken: currentSession.accessToken,
        email: currentSession.user.email,
        generation: currentGeneration,
      } : null;
      invalidation = {
        identity: currentIdentity,
        invalidatedGeneration: currentGeneration + 1,
      };
      invalidatedIdentity.current = invalidation;
      operationGeneration.current = invalidation.invalidatedGeneration;
      setSessionGeneration(invalidation.invalidatedGeneration);
      sessionRef.current = null;
      setSession(null);
    }

    const ownedInvalidation = invalidation;
    if (!expectedIdentity && !ownedInvalidation) return "no-op";
    let cleanupResult: AuthCleanupResult = "no-op";
    let storageError: unknown;
    try {
      await runStorageTransition(async () => {
        if (expectedIdentity) {
          // A failed or in-flight verification leaves no committed session. It
          // is safe to retry A's deletion cleanup there; a committed B session
          // always wins and must never be erased.
          if (sessionRef.current !== null) return;
        } else if (invalidatedIdentity.current !== ownedInvalidation
          || operationGeneration.current !== ownedInvalidation?.invalidatedGeneration
          || sessionRef.current !== null) return;
        await clearAuthSession();
        cleanupResult = "applied";
      });
    } catch (error) {
      storageError = error;
    }
    const token = expectedIdentity?.accessToken ?? ownedInvalidation?.identity?.accessToken;
    if (token) await client.logoutAuthSession(token).catch(() => undefined);
    if (storageError) throw storageError;
    return cleanupResult;
  }, [client, runStorageTransition]);
  const forgetRememberedEmail = React.useCallback(async (expectedIdentity?: AuthIdentityScope) => {
    if (expectedIdentity && !deletionCleanupTickets.current.has(identityScopeKey(expectedIdentity))) {
      return "no-op";
    }
    let cleanupResult: AuthCleanupResult = "no-op";
    await runStorageTransition(async () => {
      if (expectedIdentity) {
        const rememberedOwner = rememberedEmailRef.current?.trim().toLowerCase() ?? null;
        const expectedOwner = expectedIdentity.email.trim().toLowerCase();
        if (rememberedOwner !== expectedOwner && (rememberedOwner !== null || sessionRef.current !== null)) {
          return;
        }
      }
      await clearRememberedEmail();
      rememberedEmailRef.current = null;
      setRememberedEmail(null);
      cleanupResult = "applied";
    });
    return cleanupResult;
  }, [runStorageTransition]);

  return (
    <AuthContext.Provider
      value={{
        forgetRememberedEmail,
        getSessionGeneration: () => operationGeneration.current,
        isAuthReady,
        rememberedEmail,
        requestCode,
        session,
        sessionGeneration,
        signOut,
        switchAccount: signOut,
        user: session?.user ?? null,
        verifyCode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
