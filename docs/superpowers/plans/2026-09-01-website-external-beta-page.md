# Website External Beta Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a locally bundled `/beta/` page for the first iOS external-testing cohort, update the homepage to treat NFC, local decoration assets, and city check-in maps as implemented, and retain clear boundaries around unavailable commerce and vision features.

**Architecture:** Extend the existing static `website/` structure with one HTML page and one local JPEG, reuse the shared stylesheet, and add `/beta/` to the PowerShell static-site build map. Keep routing data-driven through the existing `pages[path]` lookup and verify both source files and generated Worker responses with the existing Node test suite.

**Tech Stack:** Static HTML/CSS, PowerShell static-site builder, Cloudflare Worker-compatible JavaScript, Node `node:test` assertions.

---

### Task 1: Create an isolated implementation branch from the latest main

**Files:**
- Read: `docs/superpowers/specs/2026-09-01-website-external-beta-page-design.md`
- Read: `docs/DECISIONS.md`

- [ ] **Step 1: Invoke the worktree workflow**

Read and follow `superpowers:using-git-worktrees`. Create an isolated worktree and branch named `codex/website-external-beta-page` from the already fetched `origin/main`.

- [ ] **Step 2: Bring the approved documentation onto the new branch**

Cherry-pick commit `51adb56` so the design and decision record accompany the implementation.

Run:

```powershell
git cherry-pick 51adb56
```

Expected: one documentation commit is applied without modifying unrelated user files.

- [ ] **Step 3: Confirm the base and workspace**

Run:

```powershell
git status --short --branch
git merge-base --is-ancestor origin/main HEAD
```

Expected: the new branch is clean, and the ancestry command exits `0`.

### Task 2: Define the beta page and capability-boundary behavior in failing tests

**Files:**
- Modify: `__tests__/app-store-site.test.mjs`
- Test: `__tests__/app-store-site.test.mjs`

- [ ] **Step 1: Add a failing source-content test**

Add a test that reads `website/beta/index.html` and `website/index.html` and asserts the approved behavior:

```js
test("publishes the first iOS external-test guide with a local WeChat group image", () => {
  assert.equal(existsSync(join(websiteRoot, "beta", "index.html")), true);
  assert.equal(existsSync(join(websiteRoot, "assets", "beta", "wechat-group-2026-09-08.jpg")), true);

  const marketing = readWebsiteFile("index.html");
  const beta = readWebsiteFile("beta/index.html");

  assert.match(marketing, /href="beta\/"[^>]*>内测说明<\/a>/);
  assert.match(beta, /第一批 iOS 用户外部测试/);
  assert.match(beta, /NFC 功能已完成验证/);
  assert.match(beta, /第一批 NFC 纪念品已生产/);
  assert.match(beta, /贴纸、相框与背景素材已实现/);
  assert.match(beta, /城市打卡与足迹地图已实现/);
  assert.match(beta, /操作步骤/);
  assert.match(beta, /iPhone 型号与 iOS 版本/);
  assert.match(beta, /不要在群内发送登录验证码、访问令牌或其他敏感信息/);
  assert.match(beta, /assets\/beta\/wechat-group-2026-09-08\.jpg/);
  assert.match(beta, /有效期至 9 月 8 日/);
  assert.doesNotMatch(beta, /https?:\/\//i);
});
```

- [ ] **Step 2: Replace obsolete future-capability assertions**

In `keeps the imported product story local while retaining every source visual`, stop requiring future labels for implemented areas. Add focused assertions:

```js
test("marks implemented beta capabilities as current while preserving unavailable boundaries", () => {
  const marketing = readWebsiteFile("index.html");

  for (const implementedClaim of [
    "城市打卡与足迹地图已实现",
    "贴纸、相框与背景素材已实现",
    "NFC 功能已完成验证",
    "第一批 NFC 纪念品已生产",
  ]) {
    assert.match(marketing, new RegExp(implementedClaim));
  }

  for (const unavailableBoundary of [
    "购买和订单服务尚未开放",
    "个人档案中心、旅行数据统计与设置管理尚未",
    "未开放实体商品、订单、配送或支付",
    "合作愿景",
  ]) {
    assert.match(marketing, new RegExp(unavailableBoundary));
  }

  assert.doesNotMatch(marketing, /城市地图[^。]{0,80}尚未在当前 App 中实现/);
  assert.doesNotMatch(marketing, /足迹地图[^。]{0,80}并非当前 App 功能/);
  assert.doesNotMatch(marketing, /贴纸、相框、背景素材库[^。]{0,80}尚未在当前 App 中提供/);
});
```

Update the release-wording test so the explicit `/beta/` page may use “内测” while the marketing/support/privacy pages continue to avoid “试用”, “TestFlight”, “实验”, “演示”, and “模拟” as release claims.

- [ ] **Step 3: Add failing generated-site assertions**

In the build-script structure test, require the beta source page to be copied and mapped:

```js
assert.match(buildScript, /Copy-Item[^\n]+"beta"/);
assert.match(buildScript, /"\/beta\/"\s*=\s*\(\[System\.IO\.File\]::ReadAllText/);
```

In the generated Worker test, request both the page and image:

```js
const betaResponse = await worker.fetch(new Request("https://onetapreality.com/beta/"));
assert.equal(betaResponse.status, 200);
assert.match(await betaResponse.text(), /第一批 iOS 用户外部测试/);

const betaImageResponse = await worker.fetch(
  new Request("https://onetapreality.com/assets/beta/wechat-group-2026-09-08.jpg"),
);
assert.equal(betaImageResponse.status, 200);
assert.match(betaImageResponse.headers.get("content-type"), /^image\/jpeg/);
assert.ok((await betaImageResponse.arrayBuffer()).byteLength > 0);
```

- [ ] **Step 4: Run the test and verify RED**

Run:

```powershell
node --test __tests__/app-store-site.test.mjs
```

Expected: FAIL because `website/beta/index.html`, the QR image, homepage copy, and `/beta/` build mapping do not exist yet. Confirm the failure is behavioral rather than a syntax error.

- [ ] **Step 5: Commit the red tests**

```powershell
git add -- __tests__/app-store-site.test.mjs
git commit -m "test: define external beta website behavior"
```

### Task 3: Add the local WeChat image and accessible beta page

**Files:**
- Create: `website/assets/beta/wechat-group-2026-09-08.jpg`
- Create: `website/beta/index.html`
- Modify: `website/styles.css`
- Test: `__tests__/app-store-site.test.mjs`

- [ ] **Step 1: Copy the user-provided image as a local asset**

Copy, without cropping or recompressing:

```text
C:\Users\carte\Documents\xwechat_files\wxid_43yueycno0cf22_2847\temp\RWTemp\2026-09\bbaacb5a4f6cd265e226b08aadeb015c\c5d6578e9e68177d5ad035f64646b91a.jpg
```

to:

```text
website/assets/beta/wechat-group-2026-09-08.jpg
```

Verify the copied file is non-empty and byte-identical with `Get-FileHash` on both paths.

- [ ] **Step 2: Create the semantic page structure**

Create `website/beta/index.html` with:

- shared `../styles.css`;
- brand link and navigation to home, support, and privacy;
- `page-hero beta-hero` containing the eyebrow `IOS EXTERNAL TEST`, heading `第一批用户外部测试已经开始。`, and links to `#test-focus` and `#wechat-group`;
- a `beta-progress-grid` with the four exact tested status claims;
- a `#test-focus` section covering iOS-only cohort status, suggested paths through city check-in/map, album decoration, and NFC gift access;
- feedback instructions requesting operation steps, iPhone/iOS version, App version, and optional screenshots/recordings;
- a security note with the exact tested warning about verification codes and tokens;
- `#wechat-group` with `<img src="../assets/beta/wechat-group-2026-09-08.jpg" alt="OneTapReality 内测用户群微信二维码，有效期至 9 月 8 日">` and visible expiry/update text;
- the shared copyright and support links.

Do not add scripts, forms, remote URLs, TestFlight distribution links, purchase buttons, or claims of public App Store availability.

- [ ] **Step 3: Add scoped responsive styles**

Append focused classes to `website/styles.css`:

```css
.beta-hero { padding-bottom: 64px; }
.beta-progress-grid {
  display: grid;
  gap: 18px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 28px;
}
.beta-progress-card,
.beta-panel {
  background: rgba(255, 250, 242, 0.86);
  border: 1px solid rgba(130, 100, 75, 0.22);
  border-radius: 18px;
  padding: 24px;
}
.beta-progress-card h3 { color: var(--terracotta); margin-top: 0; }
.beta-qr {
  display: block;
  height: auto;
  margin: 28px auto 0;
  max-width: min(100%, 560px);
  width: 100%;
}
@media (max-width: 760px) {
  .beta-progress-grid { grid-template-columns: 1fr; }
  .beta-progress-card, .beta-panel { padding: 20px; }
}
```

Use existing variables and shared page typography; add only selectors required by the new page.

- [ ] **Step 4: Run the focused source test**

Run:

```powershell
node --test --test-name-pattern="external-test guide" __tests__/app-store-site.test.mjs
```

Expected: the page-and-image source test PASS; build and homepage capability tests may remain failing until later tasks.

- [ ] **Step 5: Commit the page and asset**

```powershell
git add -- website/beta/index.html website/assets/beta/wechat-group-2026-09-08.jpg website/styles.css
git commit -m "feat: add external beta information page"
```

### Task 4: Update homepage navigation and capability status copy

**Files:**
- Modify: `website/index.html`
- Test: `__tests__/app-store-site.test.mjs`

- [ ] **Step 1: Add the beta navigation entry**

Add `<a href="beta/">内测说明</a>` to the primary navigation before technical support.

- [ ] **Step 2: Rewrite only the implemented capability notes**

Make these precise content changes:

- “记录 · 打卡”: replace the future note with `城市打卡与足迹地图已实现，可在当前 iOS 外部测试版本中体验。`
- “触碰 · 回溯”: state `NFC 功能已完成验证，第一批 NFC 纪念品已生产，并进入首批用户测试。`
- Product Overview: describe city exploration as an implemented map/check-in experience; keep commerce language absent.
- City carousel and Footprint Map sections: replace “尚未实现/并非当前功能” with current-test wording without promising automatic location detection.
- NFC sections: state current controlled-link access and produced test souvenirs; keep the shop sentence `实体商品、购买和订单服务尚未开放`.
- Stickers section: replace its unavailable note with `贴纸、相框与背景素材已实现，素材均随 App 本地提供。`

Do not change the future labels for personal statistics, purchasable city-flower goods, payment/order/delivery, or cooperation vision.

- [ ] **Step 3: Run the capability-boundary test**

Run:

```powershell
node --test --test-name-pattern="implemented beta capabilities" __tests__/app-store-site.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Run all source-level website tests**

Run:

```powershell
node --test __tests__/app-store-site.test.mjs
```

Expected: only generated-site beta route assertions remain failing if the build map has not yet been changed.

- [ ] **Step 5: Commit the homepage update**

```powershell
git add -- website/index.html __tests__/app-store-site.test.mjs
git commit -m "feat: publish current product test progress"
```

### Task 5: Bundle and serve the beta route

**Files:**
- Modify: `website/scripts/build-static-site.ps1`
- Verify: `website/worker/route.mjs`
- Test: `__tests__/app-store-site.test.mjs`

- [ ] **Step 1: Copy the beta directory into static output**

Add beside the support/privacy copies:

```powershell
Copy-Item -LiteralPath (Join-Path $siteRoot "beta") -Destination (Join-Path $outputRoot "beta") -Recurse
```

- [ ] **Step 2: Add beta page mappings**

Add to `$pages`:

```powershell
"/beta/" = ([System.IO.File]::ReadAllText((Join-Path $siteRoot "beta\index.html")))
"/beta/index.html" = ([System.IO.File]::ReadAllText((Join-Path $siteRoot "beta\index.html")))
```

No `route.mjs` change is expected because `resolveSitePage` already returns `pages[path]`; confirm that `/beta/` is covered by the generated Worker test.

- [ ] **Step 3: Run the full static-site test and verify GREEN**

Run:

```powershell
node --test __tests__/app-store-site.test.mjs
```

Expected: PASS, including the generated `/beta/` and JPEG responses.

- [ ] **Step 4: Inspect the generated output**

Run the build script into a temporary directory, verify `beta/index.html` and `assets/beta/wechat-group-2026-09-08.jpg` exist, then remove only that exact temporary directory.

Expected: both files exist; the generated Worker contains `/beta/` and no source QR path outside `website/`.

- [ ] **Step 5: Commit the builder change**

```powershell
git add -- website/scripts/build-static-site.ps1
git commit -m "build: bundle external beta website route"
```

### Task 6: Run complete verification and review the final diff

**Files:**
- Verify: all files changed in Tasks 2–5

- [ ] **Step 1: Invoke verification-before-completion**

Read and follow `superpowers:verification-before-completion` before claiming success.

- [ ] **Step 2: Run the repository quality gates**

Run each separately and require exit code `0`:

```powershell
npm run lint
npm run typecheck
npm run test:ci
npm run build:server
```

Expected: all commands PASS. This change has no dependency updates, so `package.json` and `package-lock.json` remain unchanged and a fresh `npm ci` is not required by the dependency rule.

- [ ] **Step 3: Verify scope and repository cleanliness**

Run:

```powershell
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git status --short --branch
```

Expected: no whitespace errors; diff contains only the approved docs, website page/asset/styles/homepage/builder, and website tests; working tree is clean.

- [ ] **Step 4: Review rendered behavior**

Open or locally inspect the generated `/beta/` page at desktop and narrow mobile width. Confirm readable hierarchy, no horizontal overflow, uncropped QR image, and navigation back to the homepage/support/privacy.

- [ ] **Step 5: Request final code review**

Invoke `superpowers:requesting-code-review`, address any validated findings through new failing tests first, rerun affected checks, and commit fixes separately.
