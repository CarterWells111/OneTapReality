const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

function isApiWriteFreezeEnabled(env = process.env) {
  return env.API_WRITE_FREEZE === "true";
}

function createApiWriteFreezeMiddleware(env = process.env) {
  return (request, response, next) => {
    const path = request.path || request.url || "/";
    if (!isApiWriteFreezeEnabled(env) || !path.startsWith("/api/") || safeMethods.has(request.method)) {
      next();
      return;
    }

    response.status(503).json({
      error: {
        code: "maintenance_in_progress",
        message: "Service maintenance is in progress. Please retry shortly.",
      },
    });
  };
}

module.exports = { createApiWriteFreezeMiddleware, isApiWriteFreezeEnabled };
