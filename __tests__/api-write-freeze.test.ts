const { createApiWriteFreezeMiddleware, isApiWriteFreezeEnabled } = require("../src/server/http/api-write-freeze.cjs");

function responseRecorder() {
  const response = { status: jest.fn(), json: jest.fn() };
  response.status.mockReturnValue(response);
  return response;
}

describe("API write freeze", () => {
  it("recognizes only the literal true environment value", () => {
    expect(isApiWriteFreezeEnabled({ API_WRITE_FREEZE: "true" })).toBe(true);
    expect(isApiWriteFreezeEnabled({ API_WRITE_FREEZE: "TRUE" })).toBe(false);
    expect(isApiWriteFreezeEnabled({})).toBe(false);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])("returns a stable 503 for frozen %s API requests", (method) => {
    const response = responseRecorder();
    const next = jest.fn();

    createApiWriteFreezeMiddleware({ API_WRITE_FREEZE: "true" })({ method, path: "/api/memories" }, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({
      error: { code: "maintenance_in_progress", message: "Service maintenance is in progress. Please retry shortly." },
    });
  });

  it.each(["GET", "HEAD", "OPTIONS"])("allows frozen %s API reads", (method) => {
    const response = responseRecorder();
    const next = jest.fn();

    createApiWriteFreezeMiddleware({ API_WRITE_FREEZE: "true" })({ method, path: "/api/health" }, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });

  it("never blocks a non-API path or an API request while unfrozen", () => {
    const middleware = createApiWriteFreezeMiddleware({ API_WRITE_FREEZE: "false" });
    const firstResponse = responseRecorder();
    const secondResponse = responseRecorder();
    const firstNext = jest.fn();
    const secondNext = jest.fn();

    middleware({ method: "POST", path: "/open-app/" }, firstResponse, firstNext);
    middleware({ method: "POST", path: "/api/auth/request" }, secondResponse, secondNext);

    expect(firstNext).toHaveBeenCalledTimes(1);
    expect(secondNext).toHaveBeenCalledTimes(1);
  });
});
