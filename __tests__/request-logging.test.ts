const { redactRequestTarget } = require("../src/server/http/request-log.cjs");

describe("production request logging", () => {
  it("redacts gift tokens and query values before a request is logged", () => {
    expect(redactRequestTarget("/gift/private-token?email=owner@example.com")).toBe("/gift/[redacted]");
    expect(redactRequestTarget("/api/gifts/private-token/album?publication=secret")).toBe("/api/gifts/[redacted]/album");
  });

  it("retains ordinary paths without query values", () => {
    expect(redactRequestTarget("/api/health?verbose=true")).toBe("/api/health");
  });
});
