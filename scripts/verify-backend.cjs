const { randomUUID } = require("node:crypto");

function normalizeOrigin(origin) {
  if (!origin) throw new Error("Backend origin is required");
  const normalized = origin.replace(/\/+$/, "");
  new URL(normalized);
  return normalized;
}

async function expectResponse(fetchImpl, url, options, expectedStatus) {
  const response = await fetchImpl(url, options);
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (response.status !== expectedStatus) {
    const code = body?.error?.code ?? "unexpected_response";
    throw new Error(`${options?.method ?? "GET"} ${url} returned ${response.status} (${code})`);
  }
  return { response, body };
}

async function verifyBackend(origin, fetchImpl = fetch) {
  const base = normalizeOrigin(origin);
  const summary = {};
  let accessToken;
  let memoryId;

  const health = await expectResponse(fetchImpl, `${base}/api/health`, undefined, 200);
  if (health.body?.database !== "ok") throw new Error("Backend database is not healthy");
  summary.health = health.response.status;

  const registration = await expectResponse(fetchImpl, `${base}/api/devices/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ installationId: `smoke-${randomUUID()}` }),
  }, 201);
  accessToken = registration.body?.accessToken;
  if (!accessToken) throw new Error("Device registration did not return an access token");
  summary.register = registration.response.status;

  const headers = { Authorization: `Bearer ${accessToken}` };
  try {
    const created = await expectResponse(fetchImpl, `${base}/api/memories`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Backend smoke check",
        city: "hangzhou",
        travelDate: new Date().toISOString().slice(0, 10),
        status: "saved",
        photoCount: 0,
        pages: [],
      }),
    }, 201);
    memoryId = created.body?.memory?.id;
    if (!memoryId) throw new Error("Memory creation did not return an id");
    summary.create = created.response.status;

    const listed = await expectResponse(fetchImpl, `${base}/api/memories`, { headers }, 200);
    if (!listed.body?.items?.some((item) => item.id === memoryId)) {
      throw new Error("Created memory was not returned by the list endpoint");
    }
    summary.list = listed.response.status;
  } finally {
    if (memoryId && accessToken) {
      const deleted = await expectResponse(fetchImpl, `${base}/api/memories/${encodeURIComponent(memoryId)}`, {
        method: "DELETE",
        headers,
      }, 204);
      summary.delete = deleted.response.status;
    }
  }

  return summary;
}

module.exports = { verifyBackend };

if (require.main === module) {
  const origin = process.argv[2] ?? process.env.BACKEND_API_ORIGIN;
  verifyBackend(origin)
    .then((summary) => console.log(JSON.stringify(summary)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
