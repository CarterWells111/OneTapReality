import { extractBearerToken, hashAccessToken } from "./device-auth";
import { isGiftAdminEmail } from "../gifts/admin-auth";
import type { BackendDatabase } from "../db/client";
import { ApiError } from "../http/errors";
import { getAuthenticatedSessionByTokenHash, getAuthenticatedUserByTokenHash, type AuthenticatedUser } from "./repository";

export type AuthenticatedAccount = AuthenticatedUser & { isAdmin: boolean };
export type AuthenticatedAccountSession = AuthenticatedAccount & { sessionId: string };

export async function getAuthenticatedAccount(request: Request, db: BackendDatabase, now = new Date()): Promise<AuthenticatedAccount | null> {
  const token = extractBearerToken(request.headers.get("authorization"));
  const pepper = process.env.GIFT_AUTH_PEPPER;
  if (!token || !pepper) return null;
  const user = await getAuthenticatedUserByTokenHash(db, await hashAccessToken(token, pepper), now.toISOString());
  return user ? { ...user, isAdmin: isGiftAdminEmail(user.email) } : null;
}

export async function requireAuthenticatedAccount(request: Request, db: BackendDatabase, now = new Date()): Promise<AuthenticatedAccount> {
  const account = await getAuthenticatedAccount(request, db, now);
  if (!account) throw new ApiError(401, "unauthorized", "A verified account session is required");
  return account;
}

export async function requireAuthenticatedAccountSession(request: Request, db: BackendDatabase, now = new Date()): Promise<AuthenticatedAccountSession> {
  const token = extractBearerToken(request.headers.get("authorization"));
  const pepper = process.env.GIFT_AUTH_PEPPER;
  if (!token || !pepper) throw new ApiError(401, "unauthorized", "A verified account session is required");
  const session = await getAuthenticatedSessionByTokenHash(db, await hashAccessToken(token, pepper), now.toISOString());
  if (!session) throw new ApiError(401, "unauthorized", "A verified account session is required");
  return { ...session, isAdmin: isGiftAdminEmail(session.email) };
}
