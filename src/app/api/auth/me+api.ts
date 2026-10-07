import { requireAuthenticatedAccountSession } from "../../../server/auth/session-auth";
import { getServerDatabase } from "../../../server/db/client";
import { errorResponse } from "../../../server/http/errors";

export async function GET(request: Request): Promise<Response> {
  try {
    // Restoring identity must retain logout and deletion access after Alpha removal.
    const user = await requireAuthenticatedAccountSession(request, getServerDatabase());
    return Response.json({ user: { id: user.id, email: user.email, isAdmin: user.isAdmin } });
  } catch (error) { return errorResponse(error); }
}
