import { extractBearerToken, hashAccessToken } from "../../../../server/auth/device-auth";
import { getServerDatabase } from "../../../../server/db/client";
import {
  claimGiftByTokenHash,
  getGiftSessionEmail,
} from "../../../../server/gifts/repository";
import { ApiError, errorResponse, notFoundResponse } from "../../../../server/http/errors";

function requiredEnvironment(name: "GIFT_AUTH_PEPPER" | "GIFT_TOKEN_PEPPER"): string {
  const value = name === "GIFT_AUTH_PEPPER" ? process.env.GIFT_AUTH_PEPPER : process.env.GIFT_TOKEN_PEPPER;
  if (!value) {
    throw new ApiError(503, "gift_service_unavailable", "Gift service is not configured");
  }
  return value;
}

export async function POST(request: Request, context: { token: string }) {
  try {
    const accessToken = extractBearerToken(request.headers.get("authorization"));
    if (!accessToken) {
      throw new ApiError(401, "unauthorized", "A verified email session is required");
    }

    const authPepper = requiredEnvironment("GIFT_AUTH_PEPPER");
    const tokenPepper = requiredEnvironment("GIFT_TOKEN_PEPPER");
    const now = new Date();
    const database = getServerDatabase();
    const email = await getGiftSessionEmail(
      database,
      await hashAccessToken(accessToken, authPepper),
      now.toISOString(),
    );

    if (!email) {
      throw new ApiError(401, "unauthorized", "Your email session has expired");
    }

    const gift = await claimGiftByTokenHash(
      database,
      await hashAccessToken(context.token, tokenPepper),
      email,
      now.toISOString(),
    );
    if (!gift) {
      return notFoundResponse();
    }

    return Response.json(gift, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
