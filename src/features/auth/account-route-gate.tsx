import * as React from "react";

import { useAuth } from "./auth-provider";
import { useLocalLibrary } from "./local-library-provider";

/** Local libraries are available to guests; only wait for auth bootstrap stability. */
export function AccountRouteGate({ children }: { children: React.ReactNode }) {
  const { isAuthReady } = useAuth();
  const { isReady: isLibraryReady } = useLocalLibrary();

  if (!isAuthReady || !isLibraryReady) return null;
  return <>{children}</>;
}
