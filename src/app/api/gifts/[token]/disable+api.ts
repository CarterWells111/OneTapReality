import { getServerDatabase } from "../../../../server/db/client";
import { disableGift, getGiftAccessByTokenHash, getGiftMediaObjectKeys } from "../../../../server/gifts/repository";
import { getR2MediaStoreFromEnvironment } from "../../../../server/gifts/r2-media";
import { hashGiftToken, requireGiftSessionEmail } from "../../../../server/gifts/session-auth";
import { ApiError, errorResponse } from "../../../../server/http/errors";

export async function POST(request: Request, { token }: { token: string }): Promise<Response> {
  try {
    const db = getServerDatabase();
    const email = await requireGiftSessionEmail(request, db);
    const access = await getGiftAccessByTokenHash(db, await hashGiftToken(token), email);
    if (!access || access.status !== "bound" || access.role !== "owner") throw new ApiError(403, "gift_owner_required", "Only the gift owner can disable this gift");
    const store = getR2MediaStoreFromEnvironment();
    if (!store) throw new ApiError(503, "gift_media_unavailable", "Gift media storage is not configured");
    await store.deleteObjects(await getGiftMediaObjectKeys(db, access.id));
    if (!await disableGift(db, access.id, new Date().toISOString())) throw new ApiError(409, "gift_disable_failed", "This gift can no longer be disabled");
    return new Response(null, { status: 204 });
  } catch (error) { return errorResponse(error); }
}
