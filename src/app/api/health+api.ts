import { sql } from "drizzle-orm";

import { backendContractVersion, type HealthResponse } from "../../services/backend/contracts";
import { getServerDatabase } from "../../server/db/client";
import { ApiError, errorResponse } from "../../server/http/errors";

export async function GET(_request?: Request): Promise<Response> {
  try {
    await getServerDatabase().execute(sql`select 1`);
    const response: HealthResponse = { service: "onetapreality-api", contractVersion: backendContractVersion, database: "ok" };
    return Response.json(response);
  } catch {
    return errorResponse(new ApiError(503, "database_unavailable", "Database is unavailable"));
  }
}
