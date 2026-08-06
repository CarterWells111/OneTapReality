import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import test from "node:test";
import { resolveSitePage } from "../website/worker/route.mjs";

const websiteRoot = join(process.cwd(), "website");

function readWebsiteFile(path) {
  return readFileSync(join(websiteRoot, path), "utf8");
}

test("provides the marketing, support, and privacy routes Apple requires", () => {
  assert.equal(existsSync(join(websiteRoot, "index.html")), true);
  assert.equal(existsSync(join(websiteRoot, "support", "index.html")), true);
  assert.equal(existsSync(join(websiteRoot, "privacy", "index.html")), true);

  const marketing = readWebsiteFile("index.html");
  const support = readWebsiteFile("support/index.html");
  const privacy = readWebsiteFile("privacy/index.html");

  assert.match(marketing, /OneTapReality｜一触如初/);
  assert.match(marketing, /让每一次触碰，都回到故事最初的地方。/);
  assert.match(marketing, /© 2026 Ziao Huang\. All rights reserved\./);
  assert.match(marketing, /href="support\/"/);
  assert.match(marketing, /href="privacy\/"/);
  assert.match(support, /support@onetapreality\.com/);
  assert.match(support, /App 版本号/);
  assert.match(privacy, /登录并明确发布 NFC 礼品/);
  assert.match(privacy, /私有 R2/);
  assert.match(privacy, /本地“删除所有数据”只删除设备本地内容/);
  assert.match(support, /主动发布 NFC 礼品/);
  assert.match(support, /停用礼品/);
});

test("does not market unavailable payments or cloud sync as current features", () => {
  const content = [readWebsiteFile("index.html"), readWebsiteFile("support/index.html"), readWebsiteFile("privacy/index.html")].join("\n");

  assert.doesNotMatch(content, /立即购买/);
  assert.doesNotMatch(content, /自动云同步/);
});

test("builds the static website into the server worker for reliable hosting", () => {
  const worker = readFileSync(join(websiteRoot, "worker", "index.js"), "utf8");

  assert.match(worker, /__STATIC_SITE_PAGES__/);
  assert.match(worker, /__STATIC_SITE_STYLES__/);
  assert.match(worker, /__APP_LINK_FALLBACK__/);
  assert.match(worker, /resolveSitePage/);

  const buildScript = readWebsiteFile("scripts/build-static-site.ps1");
  assert.match(buildScript, /__STATIC_SITE_PAGES__/);
  assert.match(buildScript, /__STATIC_SITE_STYLES__/);
  assert.match(buildScript, /__APP_LINK_FALLBACK__/);
  assert.match(buildScript, /open-app\\\\index\.html/);
  assert.match(buildScript, /route\.mjs/);
  assert.match(buildScript, /_redirects/);
  assert.match(buildScript, /_headers/);
  assert.match(buildScript, /"\/"\s*=\s*\(\[System\.IO\.File\]::ReadAllText/);
  assert.match(buildScript, /"\/support\/"\s*=\s*\(\[System\.IO\.File\]::ReadAllText/);
  assert.match(buildScript, /"\/privacy\/"\s*=\s*\(\[System\.IO\.File\]::ReadAllText/);
  assert.match(buildScript, /ConvertTo-Json -InputObject \$pages/);
  assert.match(buildScript, /ConvertTo-Json -InputObject \(\[System\.IO\.File\]::ReadAllText/);
});

test("bundles the carousel script and local product images into worker-served static routes", async () => {
  const outputDirectory = mkdtempSync(join(tmpdir(), "onetapreality-static-site-"));
  const buildScript = join(websiteRoot, "scripts", "build-static-site.ps1");
  const build = spawnSync(
    process.platform === "win32" ? "powershell" : "pwsh",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", buildScript, "-OutputDirectory", outputDirectory],
    { encoding: "utf8" },
  );

  try {
    assert.equal(build.status, 0, build.stderr);

    const generatedWorker = join(outputDirectory, "server", "index.js");
    const importableWorker = join(outputDirectory, "server", "index.mjs");
    writeFileSync(importableWorker, readFileSync(generatedWorker, "utf8"));
    const { default: worker } = await import(`${pathToFileURL(importableWorker).href}?${Date.now()}`);

    const scriptResponse = await worker.fetch(new Request("https://onetapreality.com/product-carousel.js"));
    assert.equal(scriptResponse.status, 200);
    assert.match(scriptResponse.headers.get("content-type"), /^application\/javascript/);
    assert.match(await scriptResponse.text(), /data-product-carousel/);

    const imageResponse = await worker.fetch(new Request("https://onetapreality.com/assets/product-introduction/brand-logo.png"));
    assert.equal(imageResponse.status, 200);
    assert.match(imageResponse.headers.get("content-type"), /^image\/png/);
    assert.ok((await imageResponse.arrayBuffer()).byteLength > 0);

    const supportResponse = await worker.fetch(new Request("https://onetapreality.com/support/"));
    assert.equal(supportResponse.status, 200);
    assert.match(await supportResponse.text(), /support@onetapreality\.com/);

    const activateResponse = await worker.fetch(new Request("https://onetapreality.com/activate"));
    assert.equal(activateResponse.status, 200);
    assert.match(await activateResponse.text(), /OneTapReality App/);

    const giftResponse = await worker.fetch(new Request("https://onetapreality.com/gift/example-token"));
    assert.equal(giftResponse.status, 200);
    const giftText = await giftResponse.text();
    assert.match(giftText, /OneTapReality App/);
    assert.doesNotMatch(giftText, /example-token/);

    const emptyGiftResponse = await worker.fetch(new Request("https://onetapreality.com/gift/"));
    assert.equal(emptyGiftResponse.status, 404);

    const unknownResponse = await worker.fetch(new Request("https://onetapreality.com/unknown"));
    assert.equal(unknownResponse.status, 404);

    const redirects = readFileSync(join(outputDirectory, "_redirects"), "utf8");
    assert.match(redirects, /^\/activate \/open-app\/ 200$/m);
    assert.match(redirects, /^\/activate\/ \/open-app\/ 200$/m);
    assert.match(redirects, /^\/gift\/\* \/open-app\/ 200$/m);

    const headers = readFileSync(join(outputDirectory, "_headers"), "utf8");
    assert.match(headers, /^\/\.well-known\/apple-app-site-association$/m);
    assert.match(headers, /Content-Type: application\/json/);
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test("serves Android Digital Asset Links for the production package", () => {
  const assetLinks = JSON.parse(readWebsiteFile(".well-known/assetlinks.json"));
  assert.deepEqual(assetLinks, [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.onetapreality.app",
      sha256_cert_fingerprints: ["66:85:7A:70:92:A4:29:EA:1A:4E:DA:E5:BD:34:90:E6:3C:68:C1:8F:F2:14:DD:24:F0:CE:40:DB:A5:C8:49:47"],
    },
  }]);

  const worker = readWebsiteFile("worker/index.js");
  const buildScript = readWebsiteFile("scripts/build-static-site.ps1");
  assert.match(worker, /__ANDROID_ASSET_LINKS__/);
  assert.match(buildScript, /__ANDROID_ASSET_LINKS__/);
});

test("serves the matching iOS universal-link association for gift and activation routes", () => {
  const association = JSON.parse(readWebsiteFile(".well-known/apple-app-site-association"));

  assert.deepEqual(association, {
    applinks: {
      details: [{
        appID: "YVJ6GJG87B.com.onereality.onetapreality",
        paths: ["/gift/*", "/activate"],
      }],
    },
  });
});

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

test("uses release-ready public wording without false local-only claims or purchase calls to action", () => {
  const content = [readWebsiteFile("index.html"), readWebsiteFile("support/index.html"), readWebsiteFile("privacy/index.html")].join("\n");

  for (const term of ["内测", "试用", "TestFlight", "BETA", "实验", "演示", "模拟"]) {
    assert.doesNotMatch(content, new RegExp(term, "i"));
  }

  assert.doesNotMatch(content, /(?:立即|现在|马上|前往).{0,8}(?:购买|订购|支付)/i);
  assert.doesNotMatch(content, /没有账号系统/);
  assert.doesNotMatch(content, /不进行真实 NFC 读写/);
  assert.doesNotMatch(content, /照片不会上传或共享/);
  assert.match(content, /默认只保存在你的设备/);
});

test("uses restrained homepage motion and honors reduced-motion preferences", () => {
  const marketing = readWebsiteFile("index.html");
  const styles = readWebsiteFile("styles.css");

  assert.match(marketing, /data-reveal/);
  assert.match(marketing, /class="book/);
  assert.match(styles, /@keyframes float-book/);
  assert.match(styles, /@keyframes stamp-in/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /scroll-behavior: auto/);
  assert.match(styles, /animation: none !important/);
});

test("imports inline product images into deterministic local assets and a manifest", async () => {
  const importerPath = join(websiteRoot, "scripts", "import-product-introduction.mjs");
  assert.equal(
    existsSync(importerPath),
    true,
    "The product introduction requires website/scripts/import-product-introduction.mjs",
  );

  const { importProductIntroduction } = await import(pathToFileURL(importerPath).href);
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "onetapreality-product-assets-"));
  const sourcePath = join(fixtureDirectory, "source.html");
  const outputDirectory = join(fixtureDirectory, "assets");
  const manifestPath = join(outputDirectory, "manifest.json");

  writeFileSync(
    sourcePath,
    [
      '<img alt="Brand logo" src="data:image/png;base64,AQID">',
      '<img src="data:image/jpeg;base64,BAUG" alt="City scene">',
    ].join("\n"),
  );

  try {
    const manifest = importProductIntroduction({
      sourcePath,
      outputDirectory,
      manifestPath,
      descriptors: [
        { id: "brand-logo", fileName: "brand-logo.png", alt: "Brand logo" },
        { id: "city-scene", fileName: "city-scene.jpg", alt: "City scene" },
      ],
    });

    assert.deepEqual(manifest.assets, [
      {
        id: "brand-logo",
        file: "brand-logo.png",
        alt: "Brand logo",
        mimeType: "image/png",
      },
      {
        id: "city-scene",
        file: "city-scene.jpg",
        alt: "City scene",
        mimeType: "image/jpeg",
      },
    ]);
    assert.deepEqual([...readFileSync(join(outputDirectory, "brand-logo.png"))], [1, 2, 3]);
    assert.deepEqual([...readFileSync(join(outputDirectory, "city-scene.jpg"))], [4, 5, 6]);
    assert.deepEqual(JSON.parse(readFileSync(manifestPath, "utf8")), manifest);
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test("requires an explicit source file when running the product asset importer", () => {
  const importerPath = join(websiteRoot, "scripts", "import-product-introduction.mjs");
  const result = spawnSync(process.execPath, [importerPath], { encoding: "utf8" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage: node import-product-introduction\.mjs <source-html-path>/);
});

test("presents the complete product introduction as an accessible screenshot carousel", () => {
  const carouselPath = join(websiteRoot, "product-carousel.js");
  assert.equal(
    existsSync(carouselPath),
    true,
    "The product introduction carousel requires website/product-carousel.js",
  );

  const marketing = readWebsiteFile("index.html");
  const carousel = readFileSync(carouselPath, "utf8");
  const slides = [...marketing.matchAll(/<article[^>]*data-carousel-slide[^>]*>[\s\S]*?<\/article>/g)];
  const immediateSlideImages = [...marketing.matchAll(/<article[^>]*data-carousel-slide[^>]*>\s*<img\b[^>]+alt="[^"]+"/g)];

  assert.match(marketing, /id="product-introduction"/);
  assert.match(marketing, /data-product-carousel/);
  assert.match(marketing, /role="region"[^>]*aria-label="OneTapReality 产品页面"/);
  assert.match(marketing, /data-carousel-previous/);
  assert.match(marketing, /data-carousel-next/);
  assert.match(marketing, /data-carousel-live/);
  assert.match(marketing, /<script[^>]*src="product-carousel\.js"[^>]*><\/script>/);
  assert.match(marketing, /Product Overview 产品概述/);
  assert.match(marketing, /Memory · Albums 记忆页面/);
  assert.match(marketing, /City · Map & Archives 城市页面/);
  assert.match(marketing, /Shop · City Keepsakes 商店页面/);
  assert.match(marketing, /My · Archive & Settings 我的页面/);
  assert.match(marketing, /The People Behind OneTapReality 团队成员/);
  assert.match(marketing, /Stickers · Frames · Backgrounds 素材装饰库/);
  assert.match(marketing, /Product & Souvenir Posters 宣传海报展示/);
  assert.match(marketing, /Cooperation & Vision 未来合作与愿景/);
  assert.match(marketing, /未来规划 \/ 概念展示/);
  assert.equal(slides.length, 4, "The four original App screenshots should become carousel pages");
  assert.equal(immediateSlideImages.length, 4, "Each carousel page should immediately present its screenshot");

  for (const [slide] of slides) {
    assert.match(slide, /<img[^>]+alt="[^"]+"/);
    assert.match(slide, /<h3[^>]*>[\s\S]+?<\/h3>/);
    assert.match(slide, /<p[^>]*>[\s\S]+?<\/p>/);
  }

  assert.match(marketing, /aria-label="上一页"/);
  assert.match(marketing, /aria-label="下一页"/);
  assert.match(marketing, /aria-live="polite"/);
  assert.doesNotMatch(carousel, /\bfetch\s*\(/);
});

test("keeps the imported product story local while retaining every source visual", () => {
  const marketing = readWebsiteFile("index.html");
  const manifest = JSON.parse(readWebsiteFile("assets/product-introduction/manifest.json"));

  assert.match(marketing, /<section[^>]+id="product-introduction"/);
  assert.match(marketing, /Product Overview 产品概述/);
  assert.match(marketing, /记录 · 打卡/);
  assert.match(marketing, /创作 · 纪念册/);
  assert.match(marketing, /触碰 · 回溯/);
  assert.match(marketing, /City Watercolor Illustrations 城市水彩插画/);
  assert.match(marketing, /Footprint Map · City Light Points 足迹地图/);
  assert.match(marketing, /NFC Cultural Creative Products NFC文创纪念品/);
  assert.match(marketing, /UI Design/);
  assert.match(marketing, /Product & Souvenir Posters 宣传海报展示/);
  assert.match(marketing, /Cooperation & Vision 未来合作与愿景/);
  assert.match(marketing, /四个人，四座城，一个共同的念头：让远方的记忆，触手可及。/);
  assert.match(marketing, /Leo/);
  assert.match(marketing, /刷子/);
  assert.match(marketing, /大虚/);
  assert.match(marketing, /三皇子/);
  assert.match(marketing, /纪念品设计与制造/);
  assert.match(marketing, /提升用户交互流畅度与自由度/);
  assert.match(marketing, /把“能看”变成“好看”/);
  assert.match(marketing, /目前任务：<\/span>联网/);

  for (const heading of [
    "City · Map & Archives 城市页面",
    "Footprint Map · City Light Points 足迹地图",
    "My · Archive & Settings 我的页面",
    "Stickers · Frames · Backgrounds 素材装饰库",
  ]) {
    assert.match(
      marketing,
      new RegExp(`${heading.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}[\\s\\S]{0,800}未来规划 / 概念展示`),
      `${heading} must be described as a future concept rather than a current feature`,
    );
  }

  for (const asset of manifest.assets) {
    assert.match(
      marketing,
      new RegExp(`assets/product-introduction/${asset.file.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`),
      `Expected ${asset.id} to be used from the local product-introduction asset directory`,
    );
  }

  assert.doesNotMatch(marketing, /data:image\//i);
  assert.doesNotMatch(marketing, /https?:\/\//i);
});

test("styles the product story as a responsive paper carousel without changing shared pages", () => {
  const styles = readWebsiteFile("styles.css");

  assert.match(styles, /#product-introduction\s*\{/);
  assert.match(styles, /#product-carousel\s*\{/);
  assert.match(styles, /\.product-carousel__slide\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*0\.9fr\)\s+minmax\(0,\s*1\.1fr\)/s);
  assert.match(styles, /\.product-carousel__slide\.is-active\s*\{/);
  assert.match(styles, /\.product-carousel__controls button\s*\{/);
  assert.match(styles, /\.product-image-grid\s*\{[^}]*repeat\(auto-fit,\s*minmax\(/s);
  assert.match(styles, /\.future-note\s*\{/);
  assert.match(styles, /@media \(max-width: 760px\)\s*\{[\s\S]*?\.product-carousel__slide\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

class CarouselElement {
  constructor(attributes = {}) {
    this.attributes = new Map(Object.entries(attributes));
    this.classNames = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this.classNames.add(name)),
      contains: (name) => this.classNames.has(name),
      remove: (...names) => names.forEach((name) => this.classNames.delete(name)),
    };
    this.handlers = new Map();
    this.hidden = false;
    this.textContent = "";
  }

  addEventListener(type, listener, options = {}) {
    const listeners = this.handlers.get(type) ?? [];
    listeners.push({ listener, once: Boolean(options.once) });
    this.handlers.set(type, listeners);
  }

  dispatch(type, event = {}) {
    const listeners = [...(this.handlers.get(type) ?? [])];
    const dispatchedEvent = {
      ...event,
      currentTarget: this,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };

    for (const entry of listeners) {
      entry.listener(dispatchedEvent);
      if (entry.once) {
        this.handlers.set(
          type,
          (this.handlers.get(type) ?? []).filter((candidate) => candidate !== entry),
        );
      }
    }

    return dispatchedEvent;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

function createCarouselFixture({ readyState = "complete" } = {}) {
  const root = new CarouselElement({ "data-product-carousel": "", tabindex: "0" });
  const slides = Array.from({ length: 4 }, () => new CarouselElement({ "data-carousel-slide": "" }));
  const previous = new CarouselElement({ "data-carousel-previous": "" });
  const next = new CarouselElement({ "data-carousel-next": "" });
  const live = new CarouselElement({ "data-carousel-live": "" });

  root.querySelectorAll = (selector) => (selector === "[data-carousel-slide]" ? slides : []);
  root.querySelector = (selector) => ({
    "[data-carousel-previous]": previous,
    "[data-carousel-next]": next,
    "[data-carousel-live]": live,
  }[selector] ?? null);

  const document = new CarouselElement();
  document.readyState = readyState;
  document.activeElement = next;
  document.querySelectorAll = (selector) => (selector === "[data-product-carousel]" ? [root] : []);

  return { document, live, next, previous, root, slides };
}

function loadCarousel(fixture) {
  const source = readWebsiteFile("product-carousel.js");
  const context = vm.createContext({
    document: fixture.document,
    globalThis: {},
    window: {},
  });

  vm.runInContext(source, context, { filename: "product-carousel.js" });
}

function assertActiveSlide(fixture, index) {
  fixture.slides.forEach((slide, slideIndex) => {
    assert.equal(slide.hidden, slideIndex !== index);
    assert.equal(slide.classList.contains("is-active"), slideIndex === index);
    assert.equal(slide.getAttribute("aria-hidden"), String(slideIndex !== index));
    assert.equal(slide.getAttribute("aria-label"), `第 ${slideIndex + 1} 页，共 4 页`);
  });
  assert.equal(fixture.live.textContent, `第 ${index + 1} 页，共 4 页`);
}

test("carousel controls wrap through slides without stealing the visitor's focus", () => {
  const fixture = createCarouselFixture();
  loadCarousel(fixture);

  assertActiveSlide(fixture, 0);
  fixture.next.dispatch("click");
  assertActiveSlide(fixture, 1);
  assert.equal(fixture.document.activeElement, fixture.next);

  fixture.next.dispatch("click");
  fixture.next.dispatch("click");
  fixture.next.dispatch("click");
  assertActiveSlide(fixture, 0);

  fixture.previous.dispatch("click");
  assertActiveSlide(fixture, 3);
});

test("carousel handles ArrowLeft and ArrowRight only while its region receives the key event", () => {
  const fixture = createCarouselFixture();
  loadCarousel(fixture);

  const right = fixture.root.dispatch("keydown", { key: "ArrowRight" });
  assert.equal(right.defaultPrevented, true);
  assertActiveSlide(fixture, 1);

  const left = fixture.root.dispatch("keydown", { key: "ArrowLeft" });
  assert.equal(left.defaultPrevented, true);
  assertActiveSlide(fixture, 0);

  const ignored = fixture.root.dispatch("keydown", { key: "ArrowDown" });
  assert.equal(ignored.defaultPrevented, false);
  assertActiveSlide(fixture, 0);
});

test("carousel changes slides for deliberate horizontal touch swipes without forcing motion", () => {
  const fixture = createCarouselFixture();
  loadCarousel(fixture);

  fixture.root.dispatch("touchstart", { touches: [{ clientX: 220, clientY: 100 }] });
  fixture.root.dispatch("touchend", { changedTouches: [{ clientX: 120, clientY: 105 }] });
  assertActiveSlide(fixture, 1);

  fixture.root.dispatch("touchstart", { touches: [{ clientX: 120, clientY: 120 }] });
  fixture.root.dispatch("touchend", { changedTouches: [{ clientX: 205, clientY: 125 }] });
  assertActiveSlide(fixture, 0);

  fixture.root.dispatch("touchstart", { touches: [{ clientX: 150, clientY: 100 }] });
  fixture.root.dispatch("touchend", { changedTouches: [{ clientX: 160, clientY: 240 }] });
  assertActiveSlide(fixture, 0);
});

test("carousel initialization is idempotent when the document finishes loading", () => {
  const fixture = createCarouselFixture({ readyState: "loading" });
  loadCarousel(fixture);

  fixture.document.dispatch("DOMContentLoaded");
  fixture.document.dispatch("DOMContentLoaded");
  fixture.next.dispatch("click");

  assertActiveSlide(fixture, 1);
});
