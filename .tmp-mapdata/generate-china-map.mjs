// 生成完整中国主体、省界、固定南海附图、产品城市坐标与全部地级标签。
// 数据源固定为 cn-atlas commit 6e83a19923e39f2c0e58a0a7ad29b349b2a71b9f
// （源自 ruiduobao/shengshixian.com 2023 版行政区划）。
// 生成与运行时均只读取仓库内 JSON，不发起网络请求。
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_COMMIT = "6e83a19923e39f2c0e58a0a7ad29b349b2a71b9f";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PROVINCES_INPUT = path.join(ROOT, ".tmp-mapdata", "provinces.json");
const PREFECTURES_INPUT = path.join(ROOT, ".tmp-mapdata", "prefectures.json");
const OUTPUT = path.join(ROOT, "src", "features", "cities", "china-map-data.ts");

const SOURCE_HASHES = Object.freeze({
  [PROVINCES_INPUT]: "0c2613c489a9c017be76f384f5b97d0df1a7632b18242009631834c495689fae",
  [PREFECTURES_INPUT]: "2ee25af1abd1cfceceb83e20d14623879fe6005b8095237cdbf198c4b39b90e1",
});

function readPinnedJson(file) {
  const buffer = fs.readFileSync(file);
  const actualHash = createHash("sha256").update(buffer).digest("hex");
  if (actualHash !== SOURCE_HASHES[file]) {
    throw new Error(`Offline map snapshot checksum mismatch: ${path.basename(file)}`);
  }
  return JSON.parse(buffer.toString("utf8"));
}

const provinceCollection = readPinnedJson(PROVINCES_INPUT);
const prefectureCollection = readPinnedJson(PREFECTURES_INPUT);

const VIEWBOX_WIDTH = 1000;
const MAIN_MARGIN = 12;
const INSET_WIDTH = 132;
const INSET_HEIGHT = 172;
const INSET_MARGIN = 8;
const TOLERANCE_FRACTION = 0.0012;
const MIN_POINTS_PER_RING = 24;
const SIMPLIFY_MIN_RING = 1.2;
const SMALL_ISLAND_MAX_POINTS = 80;

// 中国标准 Albers 等积圆锥投影（球面近似）。
const DEG = Math.PI / 180;
const PHI0 = 30 * DEG;
const LAMBDA0 = 105 * DEG;
const PHI1 = 25 * DEG;
const PHI2 = 47 * DEG;
const n = (Math.sin(PHI1) + Math.sin(PHI2)) / 2;
const C = Math.cos(PHI1) ** 2 + 2 * n * Math.sin(PHI1);
const rho0 = Math.sqrt(C - 2 * n * Math.sin(PHI0)) / n;

function albers([longitude, latitude]) {
  const phi = latitude * DEG;
  const theta = n * (longitude * DEG - LAMBDA0);
  const rho = Math.sqrt(C - 2 * n * Math.sin(phi)) / n;
  return [rho * Math.sin(theta), rho0 - rho * Math.cos(theta)];
}

function isCoordinate(value) {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(value[0])
    && Number.isFinite(value[1]);
}

function geometryPolygons(feature) {
  const rawPolygons = feature.geometry.type === "MultiPolygon"
    ? feature.geometry.coordinates
    : [feature.geometry.coordinates];
  return rawPolygons
    .map((polygon) => polygon
      .map((ring) => ring.filter(isCoordinate).map(albers))
      .filter((ring) => ring.length >= 3))
    .filter((polygon) => polygon.length > 0);
}

function signedRingArea(ring) {
  let twiceArea = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[(index + 1) % ring.length];
    twiceArea += x1 * y2 - x2 * y1;
  }
  return twiceArea / 2;
}

function largestPolygon(polygons) {
  return polygons.reduce((largest, polygon) => (
    Math.abs(signedRingArea(polygon[0])) > Math.abs(signedRingArea(largest[0])) ? polygon : largest
  ));
}

function ringCentroid(ring) {
  let twiceArea = 0;
  let xSum = 0;
  let ySum = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[(index + 1) % ring.length];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    xSum += (x1 + x2) * cross;
    ySum += (y1 + y2) * cross;
  }
  if (Math.abs(twiceArea) < Number.EPSILON) {
    const sum = ring.reduce(([x, y], point) => [x + point[0], y + point[1]], [0, 0]);
    return [sum[0] / ring.length, sum[1] / ring.length];
  }
  return [xSum / (3 * twiceArea), ySum / (3 * twiceArea)];
}

function boundsForPolygons(polygons) {
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [x, y] of ring) {
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
    }
  }
  if (!Object.values(bounds).every(Number.isFinite)) {
    throw new Error("Cannot generate a map from empty polygon bounds");
  }
  return bounds;
}

function simplifyRing(ring, tolerance) {
  if (ring.length <= 3) return ring;
  const points = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring;
  if (points.length <= 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop();
    const [ax, ay] = points[start];
    const [bx, by] = points[end];
    const denominator = Math.hypot(bx - ax, by - ay);
    let maximumDistance = 0;
    let maximumIndex = -1;
    for (let index = start + 1; index < end; index += 1) {
      const [px, py] = points[index];
      const distance = denominator === 0
        ? Math.hypot(px - ax, py - ay)
        : Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / denominator;
      if (distance > maximumDistance) {
        maximumDistance = distance;
        maximumIndex = index;
      }
    }
    if (maximumDistance > tolerance && maximumIndex > 0) {
      keep[maximumIndex] = 1;
      stack.push([start, maximumIndex], [maximumIndex, end]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

function toPath(polygons, transform) {
  const parts = [];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      const projected = ring.map(transform);
      const bounds = boundsForPolygons([[projected]]);
      const width = bounds.maxX - bounds.minX;
      const height = bounds.maxY - bounds.minY;
      const size = Math.max(width, height);
      let points = projected;
      if (size > SIMPLIFY_MIN_RING) {
        const tolerance = Math.hypot(width, height) * TOLERANCE_FRACTION;
        points = simplifyRing(projected, tolerance);
        if (points.length < MIN_POINTS_PER_RING && projected.length >= MIN_POINTS_PER_RING) {
          points = simplifyRing(projected, tolerance / 4);
        }
      } else if (projected.length > SMALL_ISLAND_MAX_POINTS) {
        points = simplifyRing(projected, Math.hypot(width, height) * TOLERANCE_FRACTION);
      }
      if (points.length < 3) continue;
      let path = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
      for (let index = 1; index < points.length; index += 1) {
        path += `L${points[index][0].toFixed(1)} ${points[index][1].toFixed(1)}`;
      }
      parts.push(`${path}Z`);
    }
  }
  return parts.join("");
}

const projectedProvinces = provinceCollection.features.map((feature) => ({
  id: String(feature.properties.id),
  name: feature.properties["地名"] || feature.properties.name,
  polygons: geometryPolygons(feature),
}));

if (projectedProvinces.length !== 34) {
  throw new Error(`Expected 34 province-level regions, received ${projectedProvinces.length}`);
}
const provinceIds = projectedProvinces.map(({ id }) => id);
if (new Set(provinceIds).size !== provinceIds.length || provinceIds.some((id) => !/^\d{6}$/.test(id))) {
  throw new Error("Province codes must be unique six-digit values");
}

const hainan = projectedProvinces.find(({ id }) => id === "460000");
if (!hainan) throw new Error("Hainan province is required to create the South China Sea inset");
const hainanMainPolygon = largestPolygon(hainan.polygons);
const southSeaPolygons = hainan.polygons.filter((polygon) => polygon !== hainanMainPolygon);
hainan.polygons = [hainanMainPolygon];
if (southSeaPolygons.length === 0) throw new Error("South China Sea inset geometry cannot be empty");

const mainBounds = boundsForPolygons(projectedProvinces.flatMap(({ polygons }) => polygons));
const mainSpanX = mainBounds.maxX - mainBounds.minX;
const mainSpanY = mainBounds.maxY - mainBounds.minY;
const mainScale = (VIEWBOX_WIDTH - MAIN_MARGIN * 2) / mainSpanX;
const viewBoxHeight = Math.ceil(mainSpanY * mainScale + MAIN_MARGIN * 2);
const mainTransform = ([x, y]) => [
  MAIN_MARGIN + (x - mainBounds.minX) * mainScale,
  MAIN_MARGIN + (mainBounds.maxY - y) * mainScale,
];

const insetBounds = boundsForPolygons(southSeaPolygons);
const insetScale = Math.min(
  (INSET_WIDTH - INSET_MARGIN * 2) / (insetBounds.maxX - insetBounds.minX),
  (INSET_HEIGHT - INSET_MARGIN * 2) / (insetBounds.maxY - insetBounds.minY),
);
const insetContentWidth = (insetBounds.maxX - insetBounds.minX) * insetScale;
const insetContentHeight = (insetBounds.maxY - insetBounds.minY) * insetScale;
const insetOffsetX = (INSET_WIDTH - insetContentWidth) / 2;
const insetOffsetY = (INSET_HEIGHT - insetContentHeight) / 2;
const insetTransform = ([x, y]) => [
  insetOffsetX + (x - insetBounds.minX) * insetScale,
  insetOffsetY + (insetBounds.maxY - y) * insetScale,
];
const insetFrame = {
  x: VIEWBOX_WIDTH - INSET_WIDTH - 16,
  y: viewBoxHeight - INSET_HEIGHT - 12,
  width: INSET_WIDTH,
  height: INSET_HEIGHT,
};

const SHORT_NAME_OVERRIDES = Object.freeze({
  "152200": "兴安", "152500": "锡林郭勒", "152900": "阿拉善", "222400": "延边",
  "232700": "大兴安岭", "422800": "恩施", "433100": "湘西", "513200": "阿坝",
  "513300": "甘孜", "513400": "凉山", "522300": "黔西南", "522600": "黔东南",
  "522700": "黔南", "532300": "楚雄", "532500": "红河", "532600": "文山",
  "532800": "西双版纳", "532900": "大理", "533100": "德宏", "533300": "怒江",
  "533400": "迪庆", "542500": "阿里", "622900": "临夏", "623000": "甘南",
  "632200": "海北", "632300": "黄南", "632500": "海南州", "632600": "果洛",
  "632700": "玉树", "632800": "海西", "652300": "昌吉", "652700": "博尔塔拉",
  "652800": "巴音郭楞", "652900": "阿克苏", "653000": "克孜勒苏", "653100": "喀什",
  "653200": "和田", "654000": "伊犁", "654200": "塔城", "654300": "阿勒泰",
  "710000": "台湾", "810000": "香港", "820000": "澳门",
});

const CAPITAL_ADCODES = new Set([
  "110000", "120000", "130100", "140100", "150100", "210100", "220100", "230100",
  "310000", "320100", "330100", "340100", "350100", "360100", "370100", "410100",
  "420100", "430100", "440100", "450100", "460100", "500000", "510100", "520100",
  "530100", "540100", "610100", "620100", "630100", "640100", "650100", "710100",
]);

const PRODUCT_CITY_COORDS = Object.freeze({
  beijing: [116.4074, 39.9042], tianjin: [117.201, 39.0842], shijiazhuang: [114.5149, 38.0428],
  taiyuan: [112.5492, 37.857], hohhot: [111.7492, 40.8426], shenyang: [123.4315, 41.8057],
  changchun: [125.3235, 43.8171], harbin: [126.6424, 45.756], shanghai: [121.4737, 31.2304],
  nanjing: [118.7969, 32.0603], hangzhou: [120.1551, 30.2741], hefei: [117.2272, 31.8206],
  fuzhou: [119.2965, 26.0745], nanchang: [115.8582, 28.6829], jinan: [117.1201, 36.6512],
  zhengzhou: [113.6254, 34.7466], wuhan: [114.3054, 30.5931], changsha: [112.9388, 28.2282],
  guangzhou: [113.2644, 23.1291], nanning: [108.32, 22.824], haikou: [110.1983, 20.044],
  chongqing: [106.5516, 29.563], chengdu: [104.0665, 30.5723], guiyang: [106.6302, 26.647],
  kunming: [102.8329, 24.8801], lhasa: [91.1409, 29.6456], xian: [108.9398, 34.3416],
  lanzhou: [103.8343, 36.0611], xining: [101.7782, 36.6171], yinchuan: [106.2309, 38.4872],
  urumqi: [87.6177, 43.7928], suzhou: [120.5853, 31.299], luoyang: [112.4544, 34.6181],
  shenzhen: [114.0579, 22.5431], taipei: [121.5654, 25.033], hongkong: [114.1694, 22.3193],
});

const PRODUCT_CITY_BY_ADCODE = Object.freeze({
  "110000": "beijing", "120000": "tianjin", "130100": "shijiazhuang", "140100": "taiyuan",
  "150100": "hohhot", "210100": "shenyang", "220100": "changchun", "230100": "harbin",
  "310000": "shanghai", "320100": "nanjing", "320500": "suzhou", "330100": "hangzhou",
  "340100": "hefei", "350100": "fuzhou", "360100": "nanchang", "370100": "jinan",
  "410100": "zhengzhou", "410300": "luoyang", "420100": "wuhan", "430100": "changsha",
  "440100": "guangzhou", "440300": "shenzhen", "450100": "nanning", "460100": "haikou",
  "500000": "chongqing", "510100": "chengdu", "520100": "guiyang", "530100": "kunming",
  "540100": "lhasa", "610100": "xian", "620100": "lanzhou", "630100": "xining",
  "640100": "yinchuan", "650100": "urumqi", "710100": "taipei", "810000": "hongkong",
});

function displayName(adcode, officialName) {
  if (SHORT_NAME_OVERRIDES[adcode]) return SHORT_NAME_OVERRIDES[adcode];
  return officialName.endsWith("市") ? officialName.slice(0, -1) : officialName;
}

function normalizedMainCoordinate(projectedCoordinate) {
  const [x, y] = mainTransform(projectedCoordinate);
  return {
    x: Number((x / VIEWBOX_WIDTH).toFixed(5)),
    y: Number((y / viewBoxHeight).toFixed(5)),
  };
}

function coordinateInsideMain(coordinate) {
  return coordinate.x >= 0 && coordinate.x <= 1 && coordinate.y >= 0 && coordinate.y <= 1;
}

const prefectureFeatures = prefectureCollection.features.filter((feature) => {
  const adcode = String(feature.properties.id || feature.properties["区划码"]);
  return /^\d{4}00$/.test(adcode);
});
if (!prefectureFeatures.some((feature) => String(feature.properties.id) === "710100")) {
  prefectureFeatures.push({
    properties: { id: "710100", "区划码": "710100", "地名": "台北市", name: "Taipei" },
    geometry: null,
  });
}

const labels = prefectureFeatures.map((feature) => {
  const adcode = String(feature.properties.id || feature.properties["区划码"]);
  const officialName = feature.properties["地名"];
  const productCity = PRODUCT_CITY_BY_ADCODE[adcode];
  let coordinate;
  if (productCity) {
    coordinate = normalizedMainCoordinate(albers(PRODUCT_CITY_COORDS[productCity]));
  } else {
    const polygon = largestPolygon(geometryPolygons(feature));
    coordinate = normalizedMainCoordinate(ringCentroid(polygon[0]));
  }
  if (!coordinateInsideMain(coordinate)) {
    if (adcode !== "460300") {
      throw new Error(`Prefecture ${adcode} projects outside the main viewBox`);
    }
    coordinate = {
      x: Number(((insetFrame.x + insetFrame.width / 2) / VIEWBOX_WIDTH).toFixed(5)),
      y: Number(((insetFrame.y + insetFrame.height / 2) / viewBoxHeight).toFixed(5)),
    };
  }
  return {
    adcode,
    officialName,
    displayName: displayName(adcode, officialName),
    coordinate,
    isCapital: CAPITAL_ADCODES.has(adcode),
    ...(productCity ? { productCity } : {}),
  };
}).sort((left, right) => left.adcode.localeCompare(right.adcode));

const labelAdcodes = labels.map(({ adcode }) => adcode);
if (new Set(labelAdcodes).size !== labelAdcodes.length || labelAdcodes.some((adcode) => !/^\d{6}$/.test(adcode))) {
  throw new Error("Prefecture codes must be unique six-digit values");
}
if (labels.some((label) => !label.officialName || !label.displayName || !coordinateInsideMain(label.coordinate))) {
  throw new Error("Every prefecture label requires a name and valid normalized coordinate");
}
const projectedProductCities = labels.flatMap((label) => label.productCity ? [label.productCity] : []);
const expectedProductCities = Object.keys(PRODUCT_CITY_COORDS);
if (projectedProductCities.length !== expectedProductCities.length
  || expectedProductCities.some((city) => !projectedProductCities.includes(city))) {
  throw new Error("Every existing product city must map to one prefecture label");
}

const provinces = projectedProvinces.map(({ id, name, polygons }) => ({ id, name, path: toPath(polygons, mainTransform) }));
const southSeaPath = toPath(southSeaPolygons, insetTransform);
if (!southSeaPath) throw new Error("South China Sea inset path cannot be empty");
const markers = Object.entries(PRODUCT_CITY_COORDS).map(([city, longitudeLatitude]) => {
  const coordinate = normalizedMainCoordinate(albers(longitudeLatitude));
  if (!coordinateInsideMain(coordinate)) throw new Error(`Product city ${city} projects outside the main viewBox`);
  return { city, x: coordinate.x, y: coordinate.y };
});

const lines = [];
lines.push("// Generated offline China map data. Do not edit by hand.");
lines.push("// Generator: .tmp-mapdata/generate-china-map.mjs");
lines.push(`// Source: cn-atlas commit ${SOURCE_COMMIT}, 2023 administrative snapshot.`);
lines.push("// Release note: verify against applicable approved standard-map requirements before production publication.");
lines.push("");
lines.push(`export const chinaMapSourceCommit = \"${SOURCE_COMMIT}\";`);
lines.push(`export const chinaMapViewBox = \"0 0 ${VIEWBOX_WIDTH} ${viewBoxHeight}\";`);
lines.push("");
lines.push("export type ChinaMapProvince = { readonly id: string; readonly name: string; readonly path: string };");
lines.push(`const generatedChinaProvinces: ChinaMapProvince[] = ${JSON.stringify(provinces)};`);
lines.push("export const chinaProvinces: readonly ChinaMapProvince[] = Object.freeze(generatedChinaProvinces.map((province) => Object.freeze(province)));");
lines.push("");
lines.push("export type ChinaSouthSeaInset = { readonly path: string; readonly viewBox: string; readonly frame: Readonly<{ x: number; y: number; width: number; height: number }> };");
lines.push(`export const chinaSouthSeaInset: ChinaSouthSeaInset = Object.freeze({ path: ${JSON.stringify(southSeaPath)}, viewBox: \"0 0 ${INSET_WIDTH} ${INSET_HEIGHT}\", frame: Object.freeze(${JSON.stringify(insetFrame)}) });`);
lines.push("");
lines.push("export type ChinaMapMarker = { readonly city: string; readonly x: number; readonly y: number };");
lines.push(`const generatedChinaMapMarkers: ChinaMapMarker[] = ${JSON.stringify(markers)};`);
lines.push("export const chinaMapMarkers: readonly ChinaMapMarker[] = Object.freeze(generatedChinaMapMarkers.map((marker) => Object.freeze(marker)));");
lines.push("");
lines.push("export type ChinaPrefectureLabel = { readonly adcode: string; readonly officialName: string; readonly displayName: string; readonly coordinate: Readonly<{ x: number; y: number }>; readonly isCapital: boolean; readonly productCity?: string };");
lines.push(`const generatedChinaPrefectureLabels: ChinaPrefectureLabel[] = ${JSON.stringify(labels)};`);
lines.push("export const chinaPrefectureLabels: readonly ChinaPrefectureLabel[] = Object.freeze(generatedChinaPrefectureLabels.map((label) => Object.freeze({ ...label, coordinate: Object.freeze(label.coordinate) })));");
lines.push("");
lines.push("export const chinaMapAttribution = \"China map · cn-atlas / ruiduobao 2023（Albers 投影）\";");
fs.writeFileSync(OUTPUT, `${lines.join("\n")}\n`, "utf8");

const totalPoints = provinces.reduce((sum, province) => sum + (province.path.match(/[ML]/g)?.length ?? 0), 0);
console.log("source commit:", SOURCE_COMMIT);
console.log("viewBox:", `0 0 ${VIEWBOX_WIDTH} ${viewBoxHeight}`);
console.log("province paths:", provinces.length, "total ML points:", totalPoints);
console.log("prefecture labels:", labels.length, "product cities:", projectedProductCities.length);
console.log("South China Sea polygons:", southSeaPolygons.length, "inset path chars:", southSeaPath.length);
console.log("output size:", `${(fs.statSync(OUTPUT).size / 1024).toFixed(1)} KB`);
