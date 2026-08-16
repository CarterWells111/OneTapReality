// 生成中国地图 SVG path 数据 + 城市标记坐标（一次运行，产物提交进仓库）
// 数据源: cn-atlas provinces.json (https://github.com/BarbarossaWang/cn-atlas, 源自 ruiduobao/shengshixian.com 2023 版行政区划)
// 投影: 中国标准 Albers 等积圆锥投影 (φ0=30, λ0=105, φ1=25, φ2=47)
// 输出: src/features/cities/china-map-data.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(ROOT, ".tmp-mapdata", "provinces.json");
const OUTPUT = path.join(ROOT, "src", "features", "cities", "china-map-data.ts");

const raw = JSON.parse(fs.readFileSync(INPUT, "utf8"));
const features = raw.features;
console.log("features:", features.length);

// ── Albers 等积投影（球面近似，中国常用参数） ──
const DEG = Math.PI / 180;
const PHI0 = 30 * DEG, LAMBDA0 = 105 * DEG, PHI1 = 25 * DEG, PHI2 = 47 * DEG;
const n = (Math.sin(PHI1) + Math.sin(PHI2)) / 2;
const C = Math.cos(PHI1) ** 2 + 2 * n * Math.sin(PHI1);
const rho0 = Math.sqrt(C - 2 * n * Math.sin(PHI0)) / n;

function albers([lon, lat]) {
  const phi = lat * DEG;
  const theta = n * (lon * DEG - LAMBDA0);
  const rho = Math.sqrt(C - 2 * n * Math.sin(phi)) / n;
  return [rho * Math.sin(theta), rho0 - rho * Math.cos(theta)];
}

// ── Douglas-Peucker 简化（投影平面） ──
// 注意：闭环数据首尾点重合会让「首尾弦」退化为 0 长度，导致全部点被丢弃；
// 因此先把末点（与首点重合的闭合点）移除，简化后再闭合。
function simplifyRing(ring, tol) {
  if (ring.length <= 3) return ring;
  // 去重闭环：末点与首点相同时去掉末点
  const points = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring;
  if (points.length <= 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let maxDist = 0, maxIdx = -1;
    const [ax, ay] = points[start], [bx, by] = points[end];
    const denom = Math.hypot(bx - ax, by - ay);
    for (let i = start + 1; i < end; i++) {
      const [px, py] = points[i];
      const d = denom === 0
        ? Math.hypot(px - ax, py - ay)
        : Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / denom;
      if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    if (maxDist > tol && maxIdx > 0) {
      keep[maxIdx] = 1;
      stack.push([start, maxIdx], [maxIdx, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// ── 投影 + 简化所有多边形，同时收集全局范围 ──
// cn-atlas 数据含少量单数值碎片环（非 [lon,lat] 对），过滤掉，避免 NaN 污染。
// 统一结构：polys = 环数组的数组（poly → rings → points）
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
const projected = features.map((f) => {
  const rings = f.geometry.coordinates; // Polygon: [ring...]; MultiPolygon: [[ring...]...]
  const polys = (f.geometry.type === "MultiPolygon" ? rings : [rings]).map((poly) =>
    poly.map((ring) => ring
      .filter((coord) => Array.isArray(coord) && coord.length >= 2 && typeof coord[0] === "number" && typeof coord[1] === "number")
      .map((coord) => {
        const [x, y] = albers(coord);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        return [x, y];
      })),
  );
  return { name: f.properties.name, id: f.properties.id, polys };
});

// 归一化到 viewBox（带边距）。SVG y 轴向下：北在上 → 投影 y 取反。
const MARGIN = 12;
const spanX = maxX - minX, spanY = maxY - minY;
const SCALE = 1000 / spanX; // 宽度基准 1000
const W = 1000;
const H = Math.round(spanY * SCALE) + MARGIN * 2;
const tx = MARGIN - minX * SCALE, ty = MARGIN - minY * SCALE;
const flipY = (y) => H - (y * SCALE + ty);

const TOL_FRACTION = 0.0012; // 相对环对角线长度的简化容差（0.12%）
const MIN_POINTS_PER_RING = 24; // 大环简化后最少保留点数，避免被吞成空环
const SIMPLIFY_MIN_RING = 1.2; // 小于该尺寸的环（南海小岛）整体保留
const SMALL_ISLAND_MAX_POINTS = 80;

function toPath(polys) {
  const parts = [];
  for (const poly of polys) {
    for (const ring of poly) {
      const proj = ring.map(([x, y]) => [x * SCALE + tx, flipY(y)]);
      // 环的包围盒
      let rminX = Infinity, rminY = Infinity, rmaxX = -Infinity, rmaxY = -Infinity;
      for (const [x, y] of proj) {
        if (x < rminX) rminX = x; if (x > rmaxX) rmaxX = x;
        if (y < rminY) rminY = y; if (y > rmaxY) rmaxY = y;
      }
      const size = Math.max(rmaxX - rminX, rmaxY - rminY);
      const isBigRing = size > SIMPLIFY_MIN_RING;
      let pts = proj;
      if (isBigRing) {
        const tol = Math.hypot(rmaxX - rminX, rmaxY - rminY) * TOL_FRACTION;
        pts = simplifyRing(proj, tol);
        // 兜底：简化过头（环被吞）时放宽容差重试
        if (pts.length < MIN_POINTS_PER_RING && proj.length >= MIN_POINTS_PER_RING) {
          pts = simplifyRing(proj, tol / 4);
        }
      } else if (proj.length > SMALL_ISLAND_MAX_POINTS) {
        pts = simplifyRing(proj, TOL_FRACTION * Math.hypot(rmaxX - rminX, rmaxY - rminY));
      }
      if (pts.length < 3) continue;
      let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
      for (let i = 1; i < pts.length; i++) d += `L${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`;
      d += "Z";
      parts.push(d);
    }
  }
  return parts.join("");
}

// ── 城市坐标（WGS84 经纬度，与 city.ts geographicCoordinates 一致） ──
const CITY_COORDS = {
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
};

function projectCity([lon, lat]) {
  const [x, y] = albers([lon, lat]);
  return { x: (x * SCALE + tx) / W, y: flipY(y) / H };
}

const markers = Object.entries(CITY_COORDS).map(([city, lonLat]) => {
  const p = projectCity(lonLat);
  return { city, x: Number(p.x.toFixed(5)), y: Number(p.y.toFixed(5)) };
});

// ── 组装输出 ──
const provinces = projected.map((f) => ({ id: f.id, name: f.name, path: toPath(f.polys) }));
const totalPoints = provinces.reduce((s, p) => s + (p.path.match(/[ML]/g)?.length ?? 0), 0);

const lines = [];
lines.push("// 中国省级行政区划地图数据（含台湾省与南海诸岛）");
lines.push("// 生成脚本: .tmp-mapdata/generate-china-map.mjs（可复现）");
lines.push("// 数据源: cn-atlas provinces.json，源自 ruiduobao/shengshixian.com 2023 版行政区划（经纬度坐标，WGS84 系）");
lines.push("// 投影: 中国标准 Albers 等积圆锥投影（φ0=30, λ0=105, φ1=25, φ2=47），已归一化到 0..1 相对坐标系");
lines.push("// 上架提示: 生产发布前请核对审图要求（含九段线/南海诸岛的正式底图）");
lines.push("");
lines.push(`export const chinaMapViewBox = \`0 0 ${W} ${H}\`;`);
lines.push("");
lines.push("export type ChinaMapProvince = { readonly id: string; readonly name: string; readonly path: string };");
lines.push(`export const chinaProvinces: readonly ChinaMapProvince[] = ${JSON.stringify(provinces, null, 0)};`);
lines.push("");
lines.push("export type ChinaMapMarker = { readonly city: string; readonly x: number; readonly y: number };");
lines.push(`export const chinaMapMarkers: readonly ChinaMapMarker[] = ${JSON.stringify(markers)};`);
lines.push("");
lines.push("export const chinaMapAttribution = \"China provincial map · ruiduobao/shengshixian.com 2023（Albers 投影）\";");
fs.writeFileSync(OUTPUT, lines.join("\n") + "\n", "utf8");

// ── 自检输出 ──
console.log("viewBox:", `0 0 ${W} ${H}`);
console.log("province paths:", provinces.length, " total ML points:", totalPoints);
const sizeKb = (fs.statSync(OUTPUT).size / 1024).toFixed(1);
console.log("output size:", sizeKb, "KB");
const spot = (city) => {
  const m = markers.find((mk) => mk.city === city);
  console.log(`  ${city}: (${m.x}, ${m.y})`);
};
console.log("marker sanity:");
spot("beijing"); spot("urumqi"); spot("haikou"); spot("taipei"); spot("hongkong"); spot("chengdu"); spot("xian");
// 大陆最西城市乌鲁木齐 x 应接近 0，北京 x ~0.65-0.75，海口 y 应接近 1（南）
