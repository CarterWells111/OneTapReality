import {
  getNonCapitalLabelLimit,
  labelFramesOverlap,
  resolveCityLabelLayouts,
  resolveCityLabelWindow,
  resolveLabelZoomTier,
  resolveNormalizedMapScreenPoint,
  resolveVisibleCityLabels,
  type CityLabelLayoutInput,
} from "../src/features/cities/city-label-layout";

const viewport = { scale: 1, translateX: 0, translateY: 0 };
const size = { height: 1000, width: 1000 };

function label(
  adcode: string,
  x: number,
  y: number,
  options: Partial<CityLabelLayoutInput> = {},
): CityLabelLayoutInput {
  return {
    adcode,
    coordinate: { x, y },
    displayName: options.displayName ?? adcode,
    isCapital: options.isCapital ?? false,
    productCity: options.productCity,
  };
}

describe("city label layout", () => {
  it("uses the central 72% × 64% window with a 4% viewport fade band", () => {
    expect(resolveCityLabelWindow(size)).toEqual({
      fadeX: 40,
      fadeY: 40,
      height: 640,
      width: 720,
      x: 140,
      y: 180,
    });
  });

  it("projects normalized anchors through the same aspect-fit portrait content frame", () => {
    const portrait = { height: 844, width: 390 };

    expect(resolveNormalizedMapScreenPoint({ x: 0.5, y: 0.5 }, viewport, portrait)).toEqual({
      x: 195,
      y: 422,
    });
  });

  it("returns only the settled visible label pool", () => {
    const labels = [
      label("110000", 0.5, 0.5, { displayName: "北京", isCapital: true }),
      label("120000", 0.02, 0.02, { displayName: "天津", isCapital: true }),
      ...Array.from({ length: 30 }, (_, index) => label(
        String(130100 + index * 100).padStart(6, "0"),
        0.42 + (index % 6) * 0.03,
        0.42 + Math.floor(index / 6) * 0.035,
        { displayName: `城${index}` },
      )),
    ];
    const zoomed = { ...viewport, scale: 3.5 };
    const layouts = resolveCityLabelLayouts(labels, zoomed, size);
    const visible = resolveVisibleCityLabels(labels, zoomed, size);

    expect(visible.map(({ adcode }) => adcode)).toEqual(
      layouts.filter(({ visible: isVisible }) => isVisible).map(({ adcode }) => adcode),
    );
    expect(visible.filter(({ isCapital }) => !isCapital).length).toBeLessThanOrEqual(24);
    expect(visible.some(({ adcode }) => adcode === "120000")).toBe(false);
  });

  it("shows only capitals below 1.6 and increases the non-capital allowance monotonically", () => {
    expect(getNonCapitalLabelLimit(1.59)).toBe(0);
    expect(getNonCapitalLabelLimit(1.6)).toBe(2);
    expect(getNonCapitalLabelLimit(1.7)).toBe(3);
    expect(getNonCapitalLabelLimit(3.9)).toBe(24);

    const labels = [
      label("110000", 0.35, 0.35, { displayName: "北京", isCapital: true, productCity: "beijing" }),
      label("120000", 0.65, 0.35, { displayName: "天津", isCapital: true, productCity: "tianjin" }),
      ...Array.from({ length: 12 }, (_, index) => label(
        String(130100 + index * 100).padStart(6, "0"),
        0.26 + (index % 4) * 0.16,
        0.5 + Math.floor(index / 4) * 0.1,
      )),
    ];

    const low = resolveCityLabelLayouts(labels, { ...viewport, scale: 1.59 }, size);
    const scales = [1.6, 1.7, 1.8, 1.9];
    const counts = scales.map((scale) => resolveCityLabelLayouts(labels, { ...viewport, scale }, size)
      .filter((layout) => layout.visible).length);

    expect(low.filter((layout) => layout.visible).map((layout) => layout.adcode)).toEqual(["110000", "120000"]);
    expect(counts).toEqual([...counts].sort((left, right) => left - right));
    expect(counts[0]).toBeGreaterThan(low.filter((layout) => layout.visible).length);
  });

  it("hides labels outside the central window and fades labels across its inner edge", () => {
    const layouts = resolveCityLabelLayouts([
      label("110000", 0.5, 0.5, { isCapital: true }),
      label("120000", 0.05, 0.5, { isCapital: true }),
      label("130100", 0.16, 0.5, { isCapital: true }),
    ], viewport, size);

    expect(layouts.find(({ adcode }) => adcode === "110000")).toMatchObject({ opacity: 1, visible: true });
    expect(layouts.find(({ adcode }) => adcode === "120000")).toMatchObject({ opacity: 0, visible: false });
    const edge = layouts.find(({ adcode }) => adcode === "130100")!;
    expect(edge.visible).toBe(true);
    expect(edge.opacity).toBeGreaterThan(0);
    expect(edge.opacity).toBeLessThan(1);
  });

  it("keeps a colliding capital ahead of product and context-only labels", () => {
    const layouts = resolveCityLabelLayouts([
      label("320500", 0.5, 0.5, { displayName: "苏州", productCity: "suzhou" }),
      label("110000", 0.5, 0.5, { displayName: "北京", isCapital: true, productCity: "beijing" }),
      label("320600", 0.5, 0.5, { displayName: "南通" }),
    ], { ...viewport, scale: 2 }, size);

    expect(layouts.find(({ adcode }) => adcode === "110000")?.visible).toBe(true);
    expect(layouts.find(({ adcode }) => adcode === "320500")?.visible).toBe(false);
    expect(layouts.find(({ adcode }) => adcode === "320600")?.visible).toBe(false);
  });

  it("returns stable non-overlapping results for an identical viewport", () => {
    const labels = Array.from({ length: 30 }, (_, index) => label(
      String(200000 + index).padStart(6, "0"),
      0.25 + (index % 6) * 0.09,
      0.3 + Math.floor(index / 6) * 0.09,
      { displayName: `城市${index}` },
    ));
    labels.push(label("110000", 0.5, 0.5, { displayName: "北京", isCapital: true }));

    const first = resolveCityLabelLayouts(labels, { ...viewport, scale: 3 }, size);
    const second = resolveCityLabelLayouts(labels, { ...viewport, scale: 3 }, size);
    const visible = first.filter((layout) => layout.visible);

    expect(second).toEqual(first);
    for (let left = 0; left < visible.length; left += 1) {
      for (let right = left + 1; right < visible.length; right += 1) {
        expect(labelFramesOverlap(visible[left].frame, visible[right].frame)).toBe(false);
      }
    }
  });

  it("holds the current zoom tier inside a narrow hysteresis band", () => {
    expect(resolveLabelZoomTier(1.6)).toBe(0);
    expect(resolveLabelZoomTier(1.61, -1)).toBe(-1);
    expect(resolveLabelZoomTier(1.63, -1)).toBe(0);
    expect(resolveLabelZoomTier(1.59, 0)).toBe(0);
    expect(resolveLabelZoomTier(1.57, 0)).toBe(-1);
  });
});
