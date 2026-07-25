import { requireAuthenticatedAccount } from "../../../server/auth/session-auth";
import { getServerDatabase } from "../../../server/db/client";
import { errorResponse } from "../../../server/http/errors";

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireAuthenticatedAccount(request, getServerDatabase());
    return Response.json({ user: { id: user.id, email: user.email, isAdmin: user.isAdmin } });
  } catch (error) { return errorResponse(error); }
}
