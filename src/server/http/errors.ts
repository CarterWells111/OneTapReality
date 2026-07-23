import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json({
      error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) },
    }, { status: error.status });
  }

  if (error instanceof ZodError) {
    const fields = Object.fromEntries(error.issues.map((issue) => [issue.path.join(".") || "body", issue.message]));
    return Response.json({
      error: { code: "validation_failed", message: "Request body is invalid", fields },
    }, { status: 400 });
  }

  return Response.json({
    error: { code: "internal_error", message: "Internal server error" },
  }, { status: 500 });
}

export function unauthorizedResponse(): Response {
  return errorResponse(new ApiError(401, "unauthorized", "A valid bearer token is required"));
}

export function notFoundResponse(): Response {
  return errorResponse(new ApiError(404, "not_found", "Resource not found"));
}
