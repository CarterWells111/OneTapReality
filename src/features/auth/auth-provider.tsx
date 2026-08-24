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

type AuthContextValue = {
  isAuthReady: boolean;
  session: AuthenticatedAccountSession | null;
  user: AuthenticatedAccountUser | null;
  rememberedEmail: string | null;
  requestCode: (email: string) => Promise<{ email: string }>;
  verifyCode: (email: string, code: string) => Promise<AuthenticatedAccountSession>;
  signOut: () => Promise<void>;
  switchAccount: () => Promise<void>;
  forgetRememberedEmail: () => Promise<void>;
  getSessionGeneration: () => number;
  sessionGeneration: number;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const client = React.useMemo(() => new BackendApiClient(), []);
  const [session, setSession] = React.useState<AuthenticatedAccountSession | null>(null);
  const [rememberedEmail, setRememberedEmail] = React.useState<string | null>(null);
  const [isAuthReady, setAuthReady] = React.useState(false);
  const operationGeneration = React.useRef(0);
  const [sessionGeneration, setSessionGeneration] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    const generation = operationGeneration.current;
    void Promise.all([
      loadRememberedEmail().catch(() => null),
      loadAuthSession().catch(() => null),
    ]).then(async ([savedEmail, savedSession]) => {
      if (!active || generation !== operationGeneration.current) return;
      setRememberedEmail(savedEmail);
      if (!savedSession) return;
      try {
        const user = await client.getCurrentAuthUser(savedSession.accessToken);
        const refreshed = { accessToken: savedSession.accessToken, user };
        if (active && generation === operationGeneration.current) {
          setSession(refreshed);
        }
      } catch (error) {
        if (!active || generation !== operationGeneration.current) return;
        const status =
          typeof error === "object" && error !== null && "status" in error
            ? Number(error.status)
            : undefined;
        if (status === 401 || status === 403) {
          await clearAuthSession().catch(() => undefined);
        } else {
          setSession(savedSession);
        }
      }
    }).finally(() => {
      if (active) setAuthReady(true);
    });
    return () => { active = false; };
  }, [client]);

  const requestCode = React.useCallback((email: string) => client.requestAuthEmailCode(email), [client]);
  const verifyCode = React.useCallback(async (email: string, code: string) => {
    const generation = ++operationGeneration.current;
    setSessionGeneration(generation);
    // Hide and invalidate the previous account before the first asynchronous
    // boundary. Old local-library callbacks consult this same generation.
    setSession(null);
    await clearAuthSession();
    const verified = await client.verifyAuthEmailCode(email, code);
    if (generation !== operationGeneration.current) {
      throw new Error("Authentication changed during verification");
    }
    await saveAuthSession(verified);
    if (generation !== operationGeneration.current) {
      await clearAuthSession().catch(() => undefined);
      throw new Error("Authentication changed during verification");
    }
    setSession(verified);
    await saveRememberedEmail(verified.user.email)
      .then(() => setRememberedEmail(verified.user.email))
      .catch(() => undefined);
    return verified;
  }, [client]);
  const signOut = React.useCallback(async () => {
    const token = session?.accessToken;
    operationGeneration.current += 1;
    setSessionGeneration(operationGeneration.current);
    setSession(null);
    let storageError: unknown;
    try {
      await clearAuthSession();
    } catch (error) {
      storageError = error;
    }
    if (token) await client.logoutAuthSession(token).catch(() => undefined);
    if (storageError) throw storageError;
  }, [client, session?.accessToken]);
  const forgetRememberedEmail = React.useCallback(async () => {
    await clearRememberedEmail();
    setRememberedEmail(null);
  }, []);

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
