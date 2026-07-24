import { extractBearerToken, hashAccessToken } from "../auth/device-auth";
import type { BackendDatabase } from "../db/client";
import { ApiError } from "../http/errors";
import { getGiftSessionEmail } from "./repository";

export async function requireGiftSessionEmail(request: Request, db: BackendDatabase, now = new Date()): Promise<string> {
  const token = extractBearerToken(request.headers.get("authorization"));
  const pepper = process.env.GIFT_AUTH_PEPPER;
  if (!token || !pepper) throw new ApiError(401, "unauthorized", "A verified email session is required");
  const email = await getGiftSessionEmail(db, await hashAccessToken(token, pepper), now.toISOString());
  if (!email) throw new ApiError(401, "unauthorized", "Your email session has expired");
  return email;
}

export async function hashGiftToken(token: string): Promise<string> {
  const pepper = process.env.GIFT_TOKEN_PEPPER;
  if (!pepper) throw new ApiError(503, "gift_service_unavailable", "Gift service is not configured");
  return hashAccessToken(token, pepper);
}
