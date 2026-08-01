import { getServerDatabase } from "../../../server/db/client";
import { getR2MediaStoreFromEnvironment } from "../../../server/gifts/r2-media";
import { ApiError, errorResponse } from "../../../server/http/errors";
import { runGiftMaintenance } from "../../../server/maintenance/run-gift-maintenance";

async function requireMaintenanceSecret(request: Request) {
  const expected = process.env.GIFT_CARD_CLEANUP_SECRET;
  const provided = request.headers.get("x-gift-maintenance-secret") ?? "";
  const [expectedHash, providedHash] = await Promise.all([expected ?? "", provided].map(async (value) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return new Uint8Array(digest);
  }));
  let difference = 0;
  for (let index = 0; index < expectedHash.length; index += 1) difference |= expectedHash[index] ^ providedHash[index];
  if (!expected || !provided || difference !== 0) {
    throw new ApiError(403, "maintenance_forbidden", "Maintenance access is not authorized");
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await requireMaintenanceSecret(request);
    const store = getR2MediaStoreFromEnvironment();
    if (!store) throw new ApiError(503, "gift_media_unavailable", "Gift media storage is not configured");
    const stats = await runGiftMaintenance({ db: getServerDatabase(), store, mode: "scheduled" });
    return Response.json(stats);
  } catch (error) { return errorResponse(error); }
}
