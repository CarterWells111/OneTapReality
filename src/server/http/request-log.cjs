function redactRequestTarget(target) {
  const path = String(target || "/").split("?", 1)[0] || "/";
  return path
    .replace(/^\/gift\/[^/]+/u, "/gift/[redacted]")
    .replace(/^\/api\/gifts\/[^/]+/u, "/api/gifts/[redacted]");
}

function productionRequestLog(tokens, request, response) {
  return [
    tokens.method(request, response),
    redactRequestTarget(request.originalUrl || request.url),
    tokens.status(request, response),
    `${tokens["response-time"](request, response)} ms`,
  ].join(" ");
}

module.exports = { productionRequestLog, redactRequestTarget };
