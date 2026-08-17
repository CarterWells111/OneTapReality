import { Slot } from "expo-router";

import { AccountRouteGate } from "../../features/auth/account-route-gate";

export default function RecycleBinRoutesLayout() {
  return <AccountRouteGate><Slot /></AccountRouteGate>;
}
