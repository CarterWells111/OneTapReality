import { getAuthenticatedUserByTokenHash } from "../auth/repository";
import { extractBearerToken, hashAccessToken } from "../auth/device-auth";
import { getServerDatabase } from "../db/client";
import { ApiError } from "../http/errors";
import { requireGiftSharingEnabled } from "./alpha-safety";
import { getOwnedGiftById } from "./repository";

type OwnedGiftOptions = {
  /**
   * 仅供停用礼品这类处置接口使用：`GIFT_SHARING_ENABLED=false` 期间仍需可用。
   * 其余接口一律沿用默认的停测拦截，新增路由默认即为关闭态。
   */
  readonly allowWhileSharingPaused?: boolean;
};

/** Resolves owner identity solely from the unified account bearer token. */
export async function requireOwnedGift(request: Request, giftId: string, options: OwnedGiftOptions = {}) {
  if (!options.allowWhileSharingPaused) requireGiftSharingEnabled();
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
