# App Link Web Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve a safe HTTP 200 installation prompt for `/activate` and valid `/gift/<token>` browser requests without exposing gift tokens or changing native App Link behavior.

**Architecture:** Add a small pure route resolver beside the existing Sites Worker so routing behavior is directly testable. The static build embeds one shared fallback HTML document, while AASA, Asset Links, existing pages, and unknown-route 404 behavior remain unchanged.

**Tech Stack:** Static HTML/CSS, Cloudflare-compatible JavaScript Worker, PowerShell build script, Node.js built-in test runner, OpenAI Sites hosting.

---

## File Structure

- Create `website/open-app/index.html`: shared browser-only installation prompt with no token or API behavior.
- Create `website/worker/route.mjs`: pure pathname-to-page resolver used by the Worker and imported by tests.
- Modify `website/worker/index.js`: inject the fallback page and delegate HTML route selection to the resolver.
- Modify `website/scripts/build-static-site.ps1`: stage the new page and resolver and replace the fallback placeholder.
- Modify `__tests__/app-store-site.test.mjs`: verify valid fallback routes, invalid routes, token secrecy, and build wiring.

### Task 1: Add failing route and build tests

**Files:**
- Modify: `__tests__/app-store-site.test.mjs`
- Test: `__tests__/app-store-site.test.mjs`

- [ ] **Step 1: Import the route resolver and add routing assertions**

Add the following import:

```js
import { resolveSitePage } from "../website/worker/route.mjs";
```

Add this test:

```js
test("serves a token-safe App Link fallback only for supported paths", () => {
  const pages = { "/": "<h1>Home</h1>" };
  const fallback = "<h1>Open OneTapReality</h1><p>Install or open the app, then tap the NFC card again.</p>";

  assert.equal(resolveSitePage("/activate", pages, fallback), fallback);
  assert.equal(resolveSitePage("/activate/", pages, fallback), fallback);
  assert.equal(resolveSitePage("/gift/example-token", pages, fallback), fallback);
  assert.equal(resolveSitePage("/gift/example-token/", pages, fallback), fallback);
  assert.equal(resolveSitePage("/gift/", pages, fallback), null);
  assert.equal(resolveSitePage("/gift/example-token/extra", pages, fallback), null);
  assert.equal(resolveSitePage("/unknown", pages, fallback), null);
  assert.doesNotMatch(resolveSitePage("/gift/private-token", pages, fallback), /private-token/);
});
```

Extend the existing Worker build test with:

```js
assert.match(worker, /__APP_LINK_FALLBACK__/);
assert.match(worker, /resolveSitePage/);
assert.match(buildScript, /__APP_LINK_FALLBACK__/);
assert.match(buildScript, /open-app\\index\.html/);
assert.match(buildScript, /route\.mjs/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test __tests__/app-store-site.test.mjs
```

Expected: FAIL because `website/worker/route.mjs` does not exist.

- [ ] **Step 3: Commit the failing test**

```powershell
git add __tests__/app-store-site.test.mjs
git commit -m "test: cover App Link web fallback"
```

### Task 2: Implement the minimal fallback route

**Files:**
- Create: `website/open-app/index.html`
- Create: `website/worker/route.mjs`
- Modify: `website/worker/index.js`
- Modify: `website/scripts/build-static-site.ps1`
- Test: `__tests__/app-store-site.test.mjs`

- [ ] **Step 1: Create the pure route resolver**

Create `website/worker/route.mjs`:

```js
const giftPathPattern = /^\/gift\/[^/]+\/?$/;

export function resolveSitePage(path, pages, appLinkFallback) {
  if (path === "/activate" || path === "/activate/" || giftPathPattern.test(path)) {
    return appLinkFallback;
  }

  return pages[path] ?? null;
}
```

- [ ] **Step 2: Create the shared installation prompt**

Create `website/open-app/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="请在 OneTapReality App 中安全打开 NFC 礼品链接。">
    <meta name="theme-color" content="#F7F2EA">
    <title>在 OneTapReality 中打开</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <header class="shell site-header">
      <a class="brand" href="/" aria-label="OneTapReality 首页">OneTapReality｜一触如初</a>
    </header>
    <main>
      <section class="shell page-hero">
        <p class="eyebrow">APP REQUIRED</p>
        <h1>请在 OneTapReality App 中打开</h1>
        <p>这个 NFC 礼品链接需要由原生 App 安全处理。</p>
      </section>
      <section class="shell content">
        <div class="contact-box">
          <h2>下一步</h2>
          <p>请安装或打开 OneTapReality，然后重新触碰 NFC 卡。</p>
        </div>
        <p><a class="button secondary" href="/">返回官网</a></p>
      </section>
    </main>
  </body>
</html>
```

- [ ] **Step 3: Wire the fallback into the Worker**

At the top of `website/worker/index.js`, add:

```js
import { resolveSitePage } from "./route.mjs";
```

After the current static constants, add:

```js
const appLinkFallback = __APP_LINK_FALLBACK__;
```

Replace direct `sitePages[path]` lookup with:

```js
const page = resolveSitePage(path, sitePages, appLinkFallback);
return page
  ? response(page, "text/html; charset=utf-8")
  : new Response("Not found", { status: 404, headers });
```

- [ ] **Step 4: Stage the page and resolver in the build**

In `website/scripts/build-static-site.ps1`, copy the page directory and resolver:

```powershell
Copy-Item -LiteralPath (Join-Path $siteRoot "open-app") -Destination (Join-Path $outputRoot "open-app") -Recurse
Copy-Item -LiteralPath (Join-Path $siteRoot "worker\route.mjs") -Destination (Join-Path $outputRoot "server\route.mjs")
```

After creating `$workerSource`, inject the page:

```powershell
$workerSource = $workerSource.Replace("__APP_LINK_FALLBACK__", (ConvertTo-Json -InputObject ([System.IO.File]::ReadAllText((Join-Path $siteRoot "open-app\index.html"))) -Compress))
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
node --test __tests__/app-store-site.test.mjs
```

Expected: all App Store website tests PASS.

- [ ] **Step 6: Build the deployable site**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File website/scripts/build-static-site.ps1
```

Expected: `website/dist/server/index.js`, `website/dist/server/route.mjs`, `website/dist/open-app/index.html`, and both `.well-known` files exist.

- [ ] **Step 7: Commit the implementation**

```powershell
git add website __tests__/app-store-site.test.mjs
git commit -m "fix: add App Link web fallback"
```

### Task 3: Run release checks

**Files:**
- Verify only; no planned source changes.

- [ ] **Step 1: Run repository quality gates**

Run:

```powershell
npm run lint
npm run typecheck
npm run test:ci
npm run build:server
```

Expected: every command exits 0.

- [ ] **Step 2: Re-run website tests and build**

Run:

```powershell
node --test __tests__/app-store-site.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File website/scripts/build-static-site.ps1
```

Expected: all tests pass and the static site build exits 0.

### Task 4: Publish and verify production

**Files:**
- Deploy: `website/dist/**`
- Hosting metadata: `website/.openai/hosting.json`

- [ ] **Step 1: Publish the validated build**

Reuse Sites project `appgprj_6a630b9918208191bf6718f2a319bc85`, push the exact validated source state, package `website/dist`, save a new version, and deploy that saved version.

Expected: Sites reports a successful production deployment for `onetapreality.com`.

- [ ] **Step 2: Verify public responses**

Check:

```text
https://onetapreality.com/activate
https://onetapreality.com/gift/example-token
https://onetapreality.com/gift/
https://onetapreality.com/.well-known/apple-app-site-association
https://onetapreality.com/.well-known/assetlinks.json
```

Expected:

- `/activate` and `/gift/example-token`: HTTP 200 with the installation prompt.
- `/gift/`: HTTP 404.
- The example token is absent from the response body.
- AASA and Asset Links: HTTP 200 JSON with their existing app identifiers.

