import type { BackendDatabase } from "../db/client";
import { getServerDatabase } from "../db/client";
import type { PrivateMediaStore } from "../gifts/r2-media";
import {
  isGiftMaintenanceOverdue,
  runGiftMaintenance,
  type GiftMaintenanceStats,
} from "./run-gift-maintenance";

const overdueAfterMs = 90 * 60_000;
const checkIntervalMs = 30 * 60_000;

export async function runOpportunisticGiftMaintenanceIfOverdue(input: {
  db: BackendDatabase;
  store: PrivateMediaStore;
  now?: Date;
}): Promise<GiftMaintenanceStats | null> {
  const now = input.now ?? new Date();
  const overdueBefore = new Date(now.getTime() - overdueAfterMs).toISOString();
  if (!await isGiftMaintenanceOverdue(input.db, overdueBefore)) return null;
  return runGiftMaintenance({ ...input, mode: "opportunistic", now });
}

let nextCheckAt = 0;
let running = false;

export function scheduleOpportunisticGiftMaintenance(): void {
  const now = Date.now();
  if (running || now < nextCheckAt) return;
  nextCheckAt = now + checkIntervalMs;

  const timer = setTimeout(() => {
    running = true;
    void (async () => {
      const { getR2MediaStoreFromEnvironment } = await import("../gifts/r2-media");
      const store = getR2MediaStoreFromEnvironment();
      if (!store) return;
      await runOpportunisticGiftMaintenanceIfOverdue({ db: getServerDatabase(), store });
    })().catch(() => undefined).finally(() => {
      running = false;
    });
  }, 0);
  (timer as unknown as { unref?: () => void }).unref?.();
}
