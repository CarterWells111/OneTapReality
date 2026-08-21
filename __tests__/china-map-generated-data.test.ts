import { readFileSync } from "node:fs";

import {
  chinaMapAttribution,
  chinaMapSourceCommit,
  chinaMapViewBox,
  chinaPrefectureLabels,
  chinaProvinces,
  chinaSouthSeaInset,
} from "../src/features/cities/china-map-data";
import { cities } from "../src/types/city";

function parseViewBox(viewBox: string) {
  const [minX, minY, width, height] = viewBox.split(/\s+/).map(Number);
  return { minX, minY, width, height };
}

function pathCoordinates(path: string) {
  const numbers = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const coordinates: { x: number; y: number }[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    coordinates.push({ x: numbers[index], y: numbers[index + 1] });
  }
  return coordinates;
}

function pathBounds(path: string) {
  const coordinates = pathCoordinates(path);
  return {
    minX: Math.min(...coordinates.map(({ x }) => x)),
    minY: Math.min(...coordinates.map(({ y }) => y)),
    maxX: Math.max(...coordinates.map(({ x }) => x)),
    maxY: Math.max(...coordinates.map(({ y }) => y)),
  };
}

function rectanglesOverlap(
  first: { minX: number; minY: number; maxX: number; maxY: number },
  second: { minX: number; minY: number; maxX: number; maxY: number },
) {
  return first.minX < second.maxX
    && second.minX < first.maxX
    && first.minY < second.maxY
    && second.minY < first.maxY;
}

describe("generated China map data", () => {
  it("pins the documented offline source and packages all 34 province-level regions", () => {
    expect(chinaMapSourceCommit).toBe("6e83a19923e39f2c0e58a0a7ad29b349b2a71b9f");
    expect(chinaProvinces).toHaveLength(34);
    expect(new Set(chinaProvinces.map((province) => province.id)).size).toBe(34);
    expect(chinaMapAttribution).toContain("cn-atlas");
    expect(chinaMapAttribution).not.toMatch(/svg-maps|CC BY/i);
  });

  it("keeps every main-map province coordinate inside a safely padded viewBox", () => {
    const { minX, minY, width, height } = parseViewBox(chinaMapViewBox);
    const right = minX + width;
    const bottom = minY + height;
    const allCoordinates = chinaProvinces.flatMap((province) => pathCoordinates(province.path));

    expect(allCoordinates.length).toBeGreaterThan(1000);
    for (const coordinate of allCoordinates) {
      expect(coordinate.x).toBeGreaterThanOrEqual(minX);
      expect(coordinate.x).toBeLessThanOrEqual(right);
      expect(coordinate.y).toBeGreaterThanOrEqual(minY);
      expect(coordinate.y).toBeLessThanOrEqual(bottom);
    }

    const heilongjiang = chinaProvinces.find((province) => province.id === "230000");
    expect(heilongjiang).toBeDefined();
    expect(Math.max(...pathCoordinates(heilongjiang!.path).map(({ x }) => x))).toBeLessThan(right);
    expect(height / width).toBeLessThan(0.9);
  });

  it("separates Hainan's largest polygon from a non-empty fixed South China Sea inset", () => {
    const hainan = chinaProvinces.find((province) => province.id === "460000");
    const { minX, minY, width, height } = parseViewBox(chinaMapViewBox);
    const frame = chinaSouthSeaInset.frame;
    const frameBounds = {
      minX: frame.x,
      minY: frame.y,
      maxX: frame.x + frame.width,
      maxY: frame.y + frame.height,
    };

    expect(hainan?.path).toMatch(/^M/);
    expect(chinaSouthSeaInset.path).toMatch(/^M/);
    expect(pathCoordinates(chinaSouthSeaInset.path).length).toBeGreaterThan(2);
    expect(parseViewBox(chinaSouthSeaInset.viewBox).width).toBeGreaterThan(0);
    expect(parseViewBox(chinaSouthSeaInset.viewBox).height).toBeGreaterThan(0);
    expect(frame.x).toBe(16);
    expect(frame.y + frame.height).toBe(minY + height - 12);
    expect(frame.x).toBeGreaterThanOrEqual(minX);
    expect(frame.y).toBeGreaterThanOrEqual(minY);
    expect(frameBounds.maxX).toBeLessThanOrEqual(minX + width);
    expect(frameBounds.maxY).toBeLessThanOrEqual(minY + height);
    for (const province of chinaProvinces) {
      expect(rectanglesOverlap(frameBounds, pathBounds(province.path))).toBe(false);
    }
    expect(Object.isFrozen(chinaSouthSeaInset)).toBe(true);
  });

  it("emits stable immutable prefecture labels and maps every product city", () => {
    const adcodes = chinaPrefectureLabels.map((label) => label.adcode);
    const productCities = chinaPrefectureLabels
      .flatMap((label) => label.productCity ? [label.productCity] : [])
      .sort();

    expect(chinaPrefectureLabels).toHaveLength(341);
    expect(chinaPrefectureLabels.every(({ adcode }) => adcode.endsWith("00"))).toBe(true);
    expect(new Set(adcodes).size).toBe(adcodes.length);
    expect(productCities).toEqual([...cities].sort());
    expect(Object.isFrozen(chinaPrefectureLabels)).toBe(true);

    for (const label of chinaPrefectureLabels) {
      expect(label.adcode).toMatch(/^\d{6}$/);
      expect(label.officialName.trim()).not.toBe("");
      expect(label.displayName.trim()).not.toBe("");
      expect(label.coordinate.x).toBeGreaterThanOrEqual(0);
      expect(label.coordinate.x).toBeLessThanOrEqual(1);
      expect(label.coordinate.y).toBeGreaterThanOrEqual(0);
      expect(label.coordinate.y).toBeLessThanOrEqual(1);
      expect(Object.isFrozen(label)).toBe(true);
      expect(Object.isFrozen(label.coordinate)).toBe(true);
    }
  });

  it("keeps generation local and validates product-city projection coverage", () => {
    const source = readFileSync(require.resolve("../.tmp-mapdata/generate-china-map.mjs"), "utf8");

    expect(source).toContain("prefectures.json");
    expect(source).toContain("6e83a19923e39f2c0e58a0a7ad29b349b2a71b9f");
    expect(source).toContain("0c2613c489a9c017be76f384f5b97d0df1a7632b18242009631834c495689fae");
    expect(source).toContain("2ee25af1abd1cfceceb83e20d14623879fe6005b8095237cdbf198c4b39b90e1");
    expect(source).toContain("createHash");
    expect(source).toContain("PRODUCT_CITY_COORDS");
    expect(source).not.toMatch(/fetch\(|https\.get|axios/i);
  });
});
