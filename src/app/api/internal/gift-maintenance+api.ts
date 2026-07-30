import { getServerDatabase } from "../../../server/db/client";
import { completeGiftMediaCleanupJob, expireGiftCardReservations, expireGiftPublishSessions, failGiftMediaCleanupJob, listGiftMediaCleanupJobs } from "../../../server/gifts/repository";
import { getR2MediaStoreFromEnvironment } from "../../../server/gifts/r2-media";
import { ApiError, errorResponse } from "../../../server/http/errors";

function requireMaintenanceSecret(request: Request) {
  const expected = process.env.GIFT_CARD_CLEANUP_SECRET;
  if (!expected || request.headers.get("x-gift-maintenance-secret") !== expected) {
    throw new ApiError(403, "maintenance_forbidden", "Maintenance access is not authorized");
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireMaintenanceSecret(request);
    const store = getR2MediaStoreFromEnvironment();
    if (!store) throw new ApiError(503, "gift_media_unavailable", "Gift media storage is not configured");
    const db = getServerDatabase();
    const now = new Date();
    const nowText = now.toISOString();
    const [expiredCards, expiredPublications] = await Promise.all([
      expireGiftCardReservations(db, nowText),
      expireGiftPublishSessions(db, nowText),
    ]);
    const jobs = await listGiftMediaCleanupJobs(db, nowText);
    let cleaned = 0;
    for (const job of jobs) {
      try {
        await store.deleteObjects([job.objectKey]);
        await completeGiftMediaCleanupJob(db, job.id, nowText);
        cleaned += 1;
      } catch (error) {
        const delayMinutes = Math.min(24 * 60, 2 ** Math.min(job.attempts + 1, 10));
        await failGiftMediaCleanupJob(db, job.id, error instanceof Error ? error.message : "R2 deletion failed", new Date(now.getTime() + delayMinutes * 60_000).toISOString());
      }
    }
    return Response.json({ expiredCards, expiredPublications, cleaned });
  } catch (error) { return errorResponse(error); }
}
