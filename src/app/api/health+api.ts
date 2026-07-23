import { sql } from "drizzle-orm";

import { backendContractVersion, type HealthResponse } from "../../services/backend/contracts";
import { getServerDatabase } from "../../server/db/client";
import { ApiError, errorResponse } from "../../server/http/errors";

export async function GET(_request?: Request): Promise<Response> {
  try {
    await getServerDatabase().run(sql`select 1`);
    const response: HealthResponse = { service: "adventurex-api", contractVersion: backendContractVersion, database: "ok" };
    return Response.json(response);
  } catch {
    return errorResponse(new ApiError(503, "database_unavailable", "Database is unavailable"));
  }
}
