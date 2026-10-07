import { backendContractVersion, type HealthResponse } from "../../services/backend/contracts";
import { getServerDatabase } from "../../server/db/client";
import { requireDatabaseReady } from "../../server/db/readiness";
import { ApiError, errorResponse } from "../../server/http/errors";

export async function GET(_request?: Request): Promise<Response> {
  try {
    const schemaVersion = await requireDatabaseReady(getServerDatabase());
    const response: HealthResponse = {
      service: "onetapreality-api",
      contractVersion: backendContractVersion,
      database: "ok",
      schemaVersion,
      writeFreeze: process.env.API_WRITE_FREEZE === "true",
    };
    return Response.json(response);
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error);
    // Drizzle's query wrapper retains PostgreSQL's schema error code in its cause.
    const wrappedError = error as { code?: unknown; cause?: { code?: unknown } } | null;
    const databaseError = wrappedError?.cause ?? wrappedError;
    if (databaseError?.code === "42P01" || databaseError?.code === "42703") {
      return errorResponse(new ApiError(503, "database_schema_outdated", "Database schema is not ready"));
    }
    return errorResponse(new ApiError(503, "database_unavailable", "Database is unavailable"));
  }
}
