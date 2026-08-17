import { usePathname, useRouter } from "expo-router";
import * as React from "react";

import { useAuth } from "./auth-provider";

/** Prevents protected route children from mounting before a local account is known. */
export function AccountRouteGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthReady, user } = useAuth();

  React.useEffect(() => {
    if (isAuthReady && !user) {
      router.replace(`/login?returnTo=${encodeURIComponent(pathname)}` as never);
    }
  }, [isAuthReady, pathname, router, user]);

  if (!isAuthReady || !user) return null;
  return <>{children}</>;
}
