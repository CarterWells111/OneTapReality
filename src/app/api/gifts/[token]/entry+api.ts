import { hashAccessToken } from "../../../../server/auth/device-auth";
import { getServerDatabase } from "../../../../server/db/client";
import { getGiftStatusByTokenHash } from "../../../../server/gifts/repository";
import { errorResponse, notFoundResponse } from "../../../../server/http/errors";
import { requireGiftSharingEnabled } from "../../../../server/gifts/alpha-safety";

type RouteContext = { token: string };

export async function GET(_request: Request, { token }: RouteContext): Promise<Response> {
  try {
    requireGiftSharingEnabled();
    const pepper = process.env.GIFT_TOKEN_PEPPER;
    if (!pepper) return errorResponse(new Error("Gift token configuration is missing"));
    const status = await getGiftStatusByTokenHash(getServerDatabase(), await hashAccessToken(token, pepper));
    return status ? Response.json({ status }) : notFoundResponse();
  } catch (error) {
    return errorResponse(error);
  }
}
