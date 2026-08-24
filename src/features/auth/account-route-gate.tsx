import * as React from "react";

import { useAuth } from "./auth-provider";

/** Local libraries are available to guests; only wait for auth bootstrap stability. */
export function AccountRouteGate({ children }: { children: React.ReactNode }) {
  const { isAuthReady } = useAuth();

  if (!isAuthReady) return null;
  return <>{children}</>;
}
