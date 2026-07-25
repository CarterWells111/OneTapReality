import * as React from "react";

import { BackendApiClient, type AuthenticatedAccountSession, type AuthenticatedAccountUser } from "../../services/backend/api-client";
import { clearAuthSession, loadAuthSession, saveAuthSession } from "./auth-storage";

type AuthContextValue = {
  isAuthReady: boolean;
  session: AuthenticatedAccountSession | null;
  user: AuthenticatedAccountUser | null;
  requestCode: (email: string) => Promise<{ email: string }>;
  verifyCode: (email: string, code: string) => Promise<AuthenticatedAccountSession>;
  signOut: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const client = React.useMemo(() => new BackendApiClient(), []);
  const [session, setSession] = React.useState<AuthenticatedAccountSession | null>(null);
  const [isAuthReady, setAuthReady] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    void loadAuthSession().then(async (saved) => {
      if (!saved) return;
      try {
        const user = await client.getCurrentAuthUser(saved.accessToken);
        const refreshed = { accessToken: saved.accessToken, user };
        await saveAuthSession(refreshed);
        if (active) setSession(refreshed);
      } catch { await clearAuthSession(); }
    }).finally(() => { if (active) setAuthReady(true); });
    return () => { active = false; };
  }, [client]);

  const requestCode = React.useCallback((email: string) => client.requestAuthEmailCode(email), [client]);
  const verifyCode = React.useCallback(async (email: string, code: string) => {
    const verified = await client.verifyAuthEmailCode(email, code);
    await saveAuthSession(verified);
    setSession(verified);
    return verified;
  }, [client]);
  const signOut = React.useCallback(async () => {
    const token = session?.accessToken;
    setSession(null);
    await clearAuthSession();
    if (token) await client.logoutAuthSession(token).catch(() => undefined);
  }, [client, session?.accessToken]);

  return <AuthContext.Provider value={{ isAuthReady, session, user: session?.user ?? null, requestCode, verifyCode, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
