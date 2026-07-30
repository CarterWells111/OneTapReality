import { getAuthenticatedUserByTokenHash } from "../auth/repository";
import { extractBearerToken, hashAccessToken } from "../auth/device-auth";
import { getServerDatabase } from "../db/client";
import { ApiError } from "../http/errors";
import { getOwnedGiftById } from "./repository";

/** Resolves owner identity solely from the unified account bearer token. */
export async function requireOwnedGift(request: Request, giftId: string) {
  const token = extractBearerToken(request.headers.get("authorization"));
  const pepper = process.env.GIFT_AUTH_PEPPER;
  if (!token || !pepper) throw new ApiError(401, "unauthorized", "A verified email session is required");
  const db = getServerDatabase();
  const user = await getAuthenticatedUserByTokenHash(db, await hashAccessToken(token, pepper), new Date().toISOString());
  if (!user) throw new ApiError(401, "unauthorized", "Your account session has expired");
  const gift = await getOwnedGiftById(db, giftId, user.email);
  if (!gift || gift.status !== "bound") throw new ApiError(403, "gift_owner_required", "Only the gift owner can manage this gift");
  return { db, email: user.email, gift };
}
