import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const websiteRoot = join(process.cwd(), "website");

function readWebsiteFile(path) {
  return readFileSync(join(websiteRoot, path), "utf8");
}

class EventTargetFixture {
  #listeners = new Map();

  addEventListener(type, listener) {
    const listeners = this.#listeners.get(type) ?? [];
    listeners.push(listener);
    this.#listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    event.preventDefault ??= () => {
      event.defaultPrevented = true;
    };

    for (const listener of this.#listeners.get(event.type) ?? []) {
      listener.call(this, event);
    }
  }
}

class ClassListFixture {
  #classes = new Set();

  add(...classes) {
    classes.forEach((className) => this.#classes.add(className));
  }

  remove(...classes) {
    classes.forEach((className) => this.#classes.delete(className));
  }

  contains(className) {
    return this.#classes.has(className);
  }

  toggle(className, force) {
    const shouldAdd = force ?? !this.#classes.has(className);
    if (shouldAdd) {
      this.#classes.add(className);
    } else {
      this.#classes.delete(className);
    }
    return shouldAdd;
  }
}

class ElementFixture extends EventTargetFixture {
  attributes = new Map();
  classList = new ClassListFixture();
  hidden = false;
  textContent = "";

  constructor(queries = {}) {
    super();
    this.queries = queries;
  }

  querySelector(selector) {
    return this.queries[selector]?.[0] ?? null;
  }

  querySelectorAll(selector) {
    return this.queries[selector] ?? [];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  click() {
    this.dispatchEvent({ type: "click" });
  }
}

function createCarouselFixture() {
  const previous = new ElementFixture();
  const next = new ElementFixture();
  const live = new ElementFixture();
  const slides = Array.from({ length: 4 }, () => new ElementFixture());
  const root = new ElementFixture({
    "[data-carousel-previous]": [previous],
    "[data-carousel-next]": [next],
    "[data-carousel-live]": [live],
    "[data-carousel-slide]": slides,
  });
  const document = new EventTargetFixture();
  const queries = {
    "[data-product-carousel]": [root],
    "[data-carousel-previous]": [previous],
    "[data-carousel-next]": [next],
    "[data-carousel-live]": [live],
    "[data-carousel-slide]": slides,
  };

  document.readyState = "loading";
  document.querySelector = (selector) => queries[selector]?.[0] ?? null;
  document.querySelectorAll = (selector) => queries[selector] ?? [];

  const window = new EventTargetFixture();
  window.document = document;
  window.matchMedia = () => ({ matches: false });

  return { document, live, next, previous, root, slides, window };
}

function assertCarouselState(fixture, activeIndex) {
  fixture.slides.forEach((slide, index) => {
    assert.equal(slide.hidden, index !== activeIndex);
    assert.equal(slide.classList.contains("is-active"), index === activeIndex);
    assert.equal(slide.getAttribute("aria-hidden"), String(index !== activeIndex));
  });
  assert.equal(fixture.root.getAttribute("aria-label"), `产品功能，第 ${activeIndex + 1} 页，共 4 页`);
  assert.equal(fixture.live.textContent, `${activeIndex + 1} / 4`);
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

test(
  "keeps carousel navigation state in sync for clicks, keys, and forty-pixel swipes",
  { skip: !existsSync(join(websiteRoot, "product-carousel.js")) },
  () => {
    const fixture = createCarouselFixture();
    const carousel = readFileSync(join(websiteRoot, "product-carousel.js"), "utf8");
    const context = {
      console,
      document: fixture.document,
      window: fixture.window,
    };

    vm.runInNewContext(carousel, context, { filename: "website/product-carousel.js" });
    fixture.document.dispatchEvent({ type: "DOMContentLoaded" });
    fixture.window.dispatchEvent({ type: "DOMContentLoaded" });

    assertCarouselState(fixture, 0);
    fixture.next.click();
    assertCarouselState(fixture, 1);
    fixture.previous.click();
    assertCarouselState(fixture, 0);
    fixture.document.dispatchEvent({ key: "ArrowRight", type: "keydown" });
    assertCarouselState(fixture, 1);
    fixture.document.dispatchEvent({ key: "ArrowLeft", type: "keydown" });
    assertCarouselState(fixture, 0);
    fixture.root.dispatchEvent({ touches: [{ clientX: 200 }], type: "touchstart" });
    fixture.root.dispatchEvent({ changedTouches: [{ clientX: 160 }], type: "touchend" });
    assertCarouselState(fixture, 1);
    fixture.root.dispatchEvent({ touches: [{ clientX: 160 }], type: "touchstart" });
    fixture.root.dispatchEvent({ changedTouches: [{ clientX: 200 }], type: "touchend" });
    assertCarouselState(fixture, 0);
  },
);
