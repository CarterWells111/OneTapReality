import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const websiteDirectory = resolve(scriptDirectory, "..");

export const productIntroductionAssets = [
  ["brand-logo", "brand-logo.png", "OneTapReality"],
  ["hero-logo", "hero-logo.png", "OneTapReality 一触如初"],
  ["album-editor", "album-editor.jpg", "纪念册编辑界面"],
  ["city-map", "city-map.jpg", "城市页面"],
  ["hangzhou", "hangzhou.png", "杭州"],
  ["beijing", "beijing.png", "北京"],
  ["shanghai", "shanghai.png", "上海"],
  ["nanjing", "nanjing.png", "南京"],
  ["footprint-map-1", "footprint-map-1.jpg", "足迹地图1"],
  ["footprint-map-2", "footprint-map-2.jpg", "足迹地图2"],
  ["footprint-map-3", "footprint-map-3.jpg", "足迹地图3"],
  ["shop", "shop.jpg", "商店页面"],
  ["beijing-magnolia", "beijing-magnolia.jpg", "北京玉兰花束"],
  ["fuzhou-jasmine", "fuzhou-jasmine.jpg", "福州茉莉花束"],
  ["hangzhou-lotus", "hangzhou-lotus.jpg", "杭州荷花花束"],
  ["kunming-camellia", "kunming-camellia.jpg", "昆明山茶花束"],
  ["xiamen-bougainvillea", "xiamen-bougainvillea.jpg", "厦门三角梅花束"],
  ["nanjing-plum", "nanjing-plum.jpg", "南京梅花花束"],
  ["shanghai-magnolia", "shanghai-magnolia.jpg", "上海白玉兰花束"],
  ["city-flower-set", "city-flower-set.jpg", "城市特色花束全套"],
  ["profile", "profile.jpg", "我的页面"],
  ["ui-memory", "ui-memory.jpg", "记忆"],
  ["ui-city", "ui-city.jpg", "城市"],
  ["ui-shop", "ui-shop.jpg", "商店"],
  ["ui-profile", "ui-profile.jpg", "我的"],
  ["sticker-1", "sticker-1.jpg", "贴纸"],
  ["sticker-2", "sticker-2.jpg", "贴纸"],
  ["sticker-3", "sticker-3.jpg", "贴纸"],
  ["sticker-4", "sticker-4.jpg", "贴纸"],
  ["sticker-5", "sticker-5.jpg", "贴纸"],
  ["sticker-6", "sticker-6.jpg", "贴纸"],
  ["sticker-7", "sticker-7.jpg", "贴纸"],
  ["sticker-8", "sticker-8.jpg", "贴纸"],
  ["frame-1", "frame-1.jpg", "相框"],
  ["frame-2", "frame-2.jpg", "相框"],
  ["frame-3", "frame-3.jpg", "相框"],
  ["frame-4", "frame-4.jpg", "相框"],
  ["background-1", "background-1.jpg", "背景"],
  ["background-2", "background-2.jpg", "背景"],
  ["background-3", "background-3.jpg", "背景"],
  ["background-4", "background-4.jpg", "背景"],
  ["product-poster-1", "product-poster-1.jpg", "产品海报1"],
  ["product-poster-2", "product-poster-2.jpg", "产品海报2"],
  ["product-poster-3", "product-poster-3.jpg", "产品海报3"],
  ["souvenir-poster", "souvenir-poster.jpg", "纪念品海报"],
  ["souvenir-card-poster", "souvenir-card-poster.jpg", "纪念品卡片海报"],
  ["tourism-cooperation-poster", "tourism-cooperation-poster.jpg", "文旅合作海报"],
  ["closing-logo", "closing-logo.png", "OneTapReality"],
].map(([id, fileName, alt]) => ({ id, fileName, alt }));

const extensionByMimeType = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/svg+xml", "svg"],
]);

function readDataUri(dataUri) {
  const match = /^data:([^;,]+)(;base64)?,([\s\S]*)$/i.exec(dataUri);

  if (!match) {
    throw new Error("The product introduction contains an unsupported image data URI.");
  }

  const [, mimeType, base64Encoding, content] = match;
  const extension = extensionByMimeType.get(mimeType.toLowerCase());

  if (!extension) {
    throw new Error(`Unsupported product image MIME type: ${mimeType}.`);
  }

  return {
    mimeType: mimeType.toLowerCase(),
    extension,
    content: base64Encoding ? Buffer.from(content, "base64") : Buffer.from(decodeURIComponent(content), "utf8"),
  };
}

function extractInlineImages(html) {
  return [...html.matchAll(/<img\b[^>]*>/gi)]
    .map((match) => match[0])
    .map((tag) => {
      const sourceMatch = /\bsrc\s*=\s*(["'])(data:[\s\S]*?)\1/i.exec(tag);

      if (!sourceMatch) {
        return null;
      }

      const altMatch = /\balt\s*=\s*(["'])(.*?)\1/i.exec(tag);
      return { dataUri: sourceMatch[2], sourceAlt: altMatch?.[2] ?? "" };
    })
    .filter(Boolean);
}

export function importProductIntroduction({
  sourcePath,
  outputDirectory = join(websiteDirectory, "assets", "product-introduction"),
  manifestPath = join(outputDirectory, "manifest.json"),
  descriptors = productIntroductionAssets,
} = {}) {
  if (!sourcePath) {
    throw new Error("A product introduction source HTML path is required.");
  }

  const inlineImages = extractInlineImages(readFileSync(sourcePath, "utf8"));

  if (inlineImages.length !== descriptors.length) {
    throw new Error(`Expected ${descriptors.length} inline product images, found ${inlineImages.length}.`);
  }

  mkdirSync(outputDirectory, { recursive: true });
  const assets = inlineImages.map((image, index) => {
    const descriptor = descriptors[index];
    const decodedImage = readDataUri(image.dataUri);
    const expectedExtension = `.${decodedImage.extension}`;

    if (extname(descriptor.fileName).toLowerCase() !== expectedExtension) {
      throw new Error(`The filename for ${descriptor.id} must end in ${expectedExtension}.`);
    }

    writeFileSync(join(outputDirectory, descriptor.fileName), decodedImage.content);

    return {
      id: descriptor.id,
      file: descriptor.fileName,
      alt: descriptor.alt ?? image.sourceAlt,
      mimeType: decodedImage.mimeType,
    };
  });

  const manifest = {
    source: basename(sourcePath),
    assets,
  };

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sourcePath = process.argv[2];

  if (!sourcePath) {
    console.error("Usage: node import-product-introduction.mjs <source-html-path>");
    process.exitCode = 1;
  } else {
    const manifest = importProductIntroduction({ sourcePath });
    console.log(`Imported ${manifest.assets.length} product images into website/assets/product-introduction/.`);
  }
}
