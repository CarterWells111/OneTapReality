import { sql } from "drizzle-orm";

import { backendContractVersion, type HealthResponse } from "../../services/backend/contracts";
import { getServerDatabase } from "../../server/db/client";
import { ApiError, errorResponse } from "../../server/http/errors";

const minimumSchemaVersion = 9;

export async function GET(_request?: Request): Promise<Response> {
  try {
    const result = await getServerDatabase().execute<{ version: number }>(
      sql`select version from app_schema_meta where key = 'database' and version >= ${minimumSchemaVersion}`,
    );
    const schemaVersion = Number(result.rows[0]?.version);
    if (!Number.isInteger(schemaVersion) || schemaVersion < minimumSchemaVersion) {
      return errorResponse(new ApiError(503, "database_schema_outdated", "Database schema is not ready"));
    }
    const response: HealthResponse = {
      service: "onetapreality-api",
      contractVersion: backendContractVersion,
      database: "ok",
      schemaVersion,
    };
    return Response.json(response);
  } catch (error) {
    const databaseError = error as { code?: unknown } | null;
    if (databaseError?.code === "42P01" || databaseError?.code === "42703") {
      return errorResponse(new ApiError(503, "database_schema_outdated", "Database schema is not ready"));
    }
    return errorResponse(new ApiError(503, "database_unavailable", "Database is unavailable"));
  }
}
