import { extractBearerToken, hashAccessToken } from "../../../server/auth/device-auth";
import { revokeAuthSessionByTokenHash } from "../../../server/auth/repository";
import { getServerDatabase } from "../../../server/db/client";
import { ApiError, errorResponse } from "../../../server/http/errors";

export async function POST(request: Request): Promise<Response> {
  try {
    const token = extractBearerToken(request.headers.get("authorization"));
    const pepper = process.env.GIFT_AUTH_PEPPER;
    if (!token || !pepper) throw new ApiError(401, "unauthorized", "A verified account session is required");
    await revokeAuthSessionByTokenHash(getServerDatabase(), await hashAccessToken(token, pepper), new Date().toISOString());
    return new Response(null, { status: 204 });
  } catch (error) { return errorResponse(error); }
}
