import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

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
  assert.match(privacy, /照片不会上传或共享/);
  assert.match(privacy, /当前版本不进行真实 NFC 读写/);
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

  const buildScript = readWebsiteFile("scripts/build-static-site.ps1");
  assert.match(buildScript, /__STATIC_SITE_PAGES__/);
  assert.match(buildScript, /__STATIC_SITE_STYLES__/);
  assert.match(buildScript, /"\/"\s*=\s*\(\[System\.IO\.File\]::ReadAllText/);
  assert.match(buildScript, /"\/support\/"\s*=\s*\(\[System\.IO\.File\]::ReadAllText/);
  assert.match(buildScript, /"\/privacy\/"\s*=\s*\(\[System\.IO\.File\]::ReadAllText/);
  assert.match(buildScript, /ConvertTo-Json -InputObject \$pages/);
  assert.match(buildScript, /ConvertTo-Json -InputObject \(\[System\.IO\.File\]::ReadAllText/);
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

test("uses release-ready public wording without pre-launch or purchase language", () => {
  const content = [readWebsiteFile("index.html"), readWebsiteFile("support/index.html"), readWebsiteFile("privacy/index.html")].join("\n");

  for (const term of ["本地", "本机", "购买", "内测", "试用", "TestFlight", "BETA", "实验", "演示", "模拟", "订购", "支付"]) {
    assert.doesNotMatch(content, new RegExp(term, "i"));
  }

  assert.match(content, /你的设备/);
  assert.match(content, /照片不会上传或共享/);
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
