const routes = [
  { path: "/", contentType: /^text\/html/i },
  { path: "/support/", contentType: /^text\/html/i },
  { path: "/privacy/", contentType: /^text\/html/i },
  { path: "/.well-known/apple-app-site-association", contentType: /^application\/json/i },
  { path: "/activate", contentType: /^text\/html/i },
  { path: "/gift/verification-token", contentType: /^text\/html/i, tokenSafe: true },
];

function normalizeOrigin(origin) {
  if (!origin) throw new Error("rootOrigin and wwwOrigin are required");
  return new URL(origin).origin;
}

async function verifyPublicSite({ rootOrigin, wwwOrigin, fetchImpl = fetch }) {
  const root = normalizeOrigin(rootOrigin);
  const www = normalizeOrigin(wwwOrigin);
  const summary = [];

  for (const route of routes) {
    const rootResponse = await fetchImpl(`${root}${route.path}`, { redirect: "manual" });
    if (rootResponse.status !== 200) throw new Error(`root request failed for ${route.path}: ${rootResponse.status}`);
    if (!route.contentType.test(rootResponse.headers.get("content-type") || "")) throw new Error(`root content type mismatch for ${route.path}`);
    if (route.tokenSafe && (await rootResponse.text()).includes("verification-token")) throw new Error("gift fallback exposed verification token");

    const wwwResponse = await fetchImpl(`${www}${route.path}`, { redirect: "manual" });
    const location = wwwResponse.headers.get("location");
    if (![301, 308].includes(wwwResponse.status) || location !== `${root}${route.path}`) {
      throw new Error(`www redirect mismatch for ${route.path}`);
    }
    summary.push({ path: route.path, rootStatus: rootResponse.status, wwwStatus: wwwResponse.status });
  }

  return summary;
}

module.exports = { verifyPublicSite };

if (require.main === module) {
  verifyPublicSite({ rootOrigin: process.argv[2], wwwOrigin: process.argv[3] })
    .then((summary) => console.log(JSON.stringify(summary)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
