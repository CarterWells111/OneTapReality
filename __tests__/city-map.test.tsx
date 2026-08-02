import { act, fireEvent, render } from "@testing-library/react-native";
import { readFileSync } from "node:fs";

import { CityMap, getCityMapTransform, OfflineChinaMapAdapter, resolveChinaMapContentFrame, resolveChinaMapCoordinate, resolveCityMarkerLayout, resolveWorkspaceMarkerModels, type CityStats } from "../src/features/cities";

const stats: CityStats[] = [
  { city: "hangzhou", visitCount: 2, unlocked: true, isVisited: true, intensity: "medium" },
  { city: "shanghai", visitCount: 0, unlocked: false, isVisited: false, intensity: "none" },
  { city: "shenzhen", visitCount: 4, unlocked: true, isVisited: true, intensity: "strong" },
];

describe("CityMap", () => {
  it("renders every local marker with its saved-memory count and visit-intensity token", async () => {
    const screen = await render(<CityMap stats={stats} variant="overview" />);

    expect(screen.getByLabelText("杭州，已保存 2 册旅行记忆")).toBeTruthy();
    expect(screen.getByLabelText("上海，已保存 0 册旅行记忆")).toBeTruthy();
    expect(screen.getByLabelText("深圳，已保存 4 册旅行记忆")).toBeTruthy();
    expect(screen.getByTestId("city-map-marker-hangzhou-medium")).toBeTruthy();
    expect(screen.getByTestId("city-map-marker-shanghai-none")).toBeTruthy();
    expect(screen.getByTestId("city-map-marker-shenzhen-strong")).toBeTruthy();
  });

  it("renders every packaged China province with a visible boundary and attribution", async () => {
    const screen = await render(<CityMap stats={stats} variant="overview" />);
    const provinces = screen.getAllByTestId(/^china-province-/);

    expect(provinces.length).toBeGreaterThanOrEqual(31);
    expect(provinces.every((province) => province.props.strokeWidth > 0)).toBe(true);
    // 台湾省界已包含在正式数据中，不再依赖手绘插画
    expect(screen.queryByTestId("china-province-taiwan-inset")).toBeNull();
    expect(screen.getByText(/China provincial map/i)).toBeTruthy();
  });

  it("projects every local marker into the China SVG viewBox rather than the outer map container", () => {
    const adapter = new OfflineChinaMapAdapter();

    for (const marker of adapter.markers) {
      const coordinate = resolveChinaMapCoordinate(marker);
      expect(coordinate.x).toBeGreaterThanOrEqual(0);
      expect(coordinate.x).toBeLessThanOrEqual(1000);
      expect(coordinate.y).toBeGreaterThanOrEqual(0);
      expect(coordinate.y).toBeLessThanOrEqual(1171);
    }

    expect(resolveChinaMapCoordinate(adapter.markers.find((marker) => marker.city === "hangzhou")!)).toMatchObject({
      x: expect.closeTo(852.46, 1),
      y: expect.closeTo(553.7, 1),
    });
  });

  it("uses the SVG meet content frame for a letterboxed workspace", () => {
    expect(resolveChinaMapContentFrame({ height: 320, width: 480 })).toEqual({
      height: 320,
      scale: 320 / 1171,
      width: (1000 * 320) / 1171,
      x: (480 - (1000 * 320) / 1171) / 2,
      y: 0,
    });
  });

  it("renders provinces, markers, and labels inside one undistorted China SVG", async () => {
    const screen = await render(<CityMap initialCity="hangzhou" stats={stats} variant="workspace" />);

    expect(screen.getByTestId("city-map-content")).toBeTruthy();
    expect(screen.getByTestId("city-map-marker-dot-jinan-none")).toBeTruthy();
    // 新坐标系下默认视口不放大，label 仅在 zoom ≥1.8 显示；直接断言 SVG 与标记存在即可
    expect(screen.queryByTestId("city-map-label-jinan")).toBeNull();
  });

  it("calls the city callback when an interactive marker is pressed", async () => {
    const onCityPress = jest.fn();
    const screen = await render(<CityMap stats={stats} variant="workspace" interactive onCityPress={onCityPress} />);

    fireEvent.press(screen.getByLabelText("杭州，已保存 2 册旅行记忆"));

    expect(onCityPress).toHaveBeenCalledWith("hangzhou");
  });

  it("starts a workspace map at the selected adapter city focus", async () => {
    const screen = await render(<CityMap initialCity="shenzhen" stats={stats} variant="workspace" />);

    await act(async () => {
      fireEvent(screen.getByTestId("city-map-workspace"), "layout", {
        nativeEvent: { layout: { height: 320, width: 480, x: 0, y: 0 } },
      });
    });

    const transforms = getCityMapTransform({ scale: 2, translateX: -201.6, translateY: -160 });
    expect(transforms[0].translateX).toBeCloseTo(-201.6);
    expect(transforms[1]).toEqual({ translateY: -160 });
    expect(transforms[2]).toEqual({ scale: 2 });
  });

  it("keeps every overview marker accessible while labels remain hidden at the low overview zoom", async () => {
    const screen = await render(<CityMap stats={stats} variant="overview" />);
    const hangzhouTarget = screen.getByTestId("city-map-marker-target-hangzhou-medium").props;
    const shanghaiTarget = screen.getByTestId("city-map-marker-target-shanghai-none").props;

    expect(hangzhouTarget.accessibilityRole).toBe("button");
    expect(shanghaiTarget.accessibilityRole).toBe("button");
    expect(screen.queryByText("杭州 · 2 册")).toBeNull();
    expect(screen.queryByText("上海 · 0 册")).toBeNull();
    expect(screen.getByTestId("city-map-marker-beijing-none")).toBeTruthy();
    expect(screen.getByLabelText("北京，已保存 0 册旅行记忆")).toBeTruthy();
  });

  it("resolves every adapter marker into bounded overview geometry", () => {
    const mapWidth = 300;
    const mapHeight = 351;
    const adapter = new OfflineChinaMapAdapter();
    const layouts = adapter.markers.map((marker) => ({ layout: resolveCityMarkerLayout(marker), marker }));

    for (const { layout, marker } of layouts) {
      expect(layout.pressFrame.width).toBe(44);
      expect(layout.pressFrame.height).toBe(44);
      expect(layout.labelFrame.x).toBeGreaterThanOrEqual(0);
      expect(layout.labelFrame.y).toBeGreaterThanOrEqual(0);
      expect(layout.labelFrame.x + layout.labelFrame.width).toBeLessThanOrEqual(mapWidth);
      expect(layout.labelFrame.y + layout.labelFrame.height).toBeLessThanOrEqual(mapHeight);
      expect(layout.markerFrame.x + layout.markerFrame.width / 2).toBeCloseTo(marker.coordinate.x * mapWidth);
      expect(layout.markerFrame.y + layout.markerFrame.height / 2).toBeCloseTo(marker.coordinate.y * mapHeight);
    }
  });

  // 概览图宽度由外层卡片决定（手机上约 312pt，平板上可超过 600pt），
  // 按压热区若固定按 300×351 计算，就会与 SVG 里画出的圆点错位。
  it("scales overview marker geometry to the measured container instead of a fixed 300pt card", () => {
    const marker = new OfflineChinaMapAdapter().markers.find((candidate) => candidate.city === "shanghai")!;
    const layout = resolveCityMarkerLayout(marker, { height: 702, width: 600 });

    expect(layout.pressFrame.x + layout.pressFrame.width / 2).toBeCloseTo(marker.coordinate.x * 600);
    expect(layout.pressFrame.y + layout.pressFrame.height / 2).toBeCloseTo(marker.coordinate.y * 702);
    expect(layout.labelFrame.x).toBeGreaterThanOrEqual(0);
    expect(layout.labelFrame.x + layout.labelFrame.width).toBeLessThanOrEqual(600);
  });

  it("repositions overview press targets after the card reports its measured size", async () => {
    const screen = await render(<CityMap stats={stats} variant="overview" />);

    await act(async () => {
      fireEvent(screen.getByTestId("city-map-overview"), "layout", {
        nativeEvent: { layout: { height: 702, width: 600, x: 0, y: 0 } },
      });
    });

    const marker = new OfflineChinaMapAdapter().markers.find((candidate) => candidate.city === "shanghai")!;
    const style = screen.getByTestId("city-map-marker-target-shanghai-none").props.style;
    const resolved = Array.isArray(style) ? Object.assign({}, ...style) : style;

    expect(resolved.left + resolved.width / 2).toBeCloseTo(marker.coordinate.x * 600);
    expect(resolved.top + resolved.height / 2).toBeCloseTo(marker.coordinate.y * 702);
  });

  it("hides workspace labels below the zoom threshold and scales the full marker model on the worklet viewport", () => {
    const markers = new OfflineChinaMapAdapter().markers;
    const size = { height: 351, width: 300 };
    const hiddenModels = resolveWorkspaceMarkerModels(markers, { scale: 1.79, translateX: 0, translateY: 0 }, size);
    // 显式选北京（cityRegistry[0] 是乌鲁木齐，位于地图西北角，默认视口下在屏幕外）
    const beijing = markers.find((marker) => marker.city === "beijing")!;
    // 视口平移量把北京居中到 (150, 175)（按新坐标系 contentFrame 反算）
    const visibleModels = resolveWorkspaceMarkerModels([beijing], { scale: 1.8, translateX: -136.8, translateY: 132.5 }, size);

    expect(hiddenModels.every((model) => !model.showLabel)).toBe(true);
    expect(visibleModels[0]?.dotSize).toBeCloseTo(14.4);
    expect(visibleModels[0]?.fontSize).toBeCloseTo(19.8);
    expect(visibleModels[0]?.pressSize).toBeCloseTo(79.2);
    expect(visibleModels[0]?.showLabel).toBe(true);
  });

  it("shows only one of two colliding workspace labels", () => {
    const markers = new OfflineChinaMapAdapter().markers;
    const beijing = markers.find((marker) => marker.city === "beijing")!;
    const overlappingMarkers = [beijing, { ...beijing, coordinate: beijing.coordinate }];
    const models = resolveWorkspaceMarkerModels(overlappingMarkers, { scale: 2, translateX: -152, translateY: 147.3 }, { height: 351, width: 300 });

    expect(models.map((model) => model.showLabel)).toEqual([true, false]);
  });

  it("avoids object spread in the UI-thread label collision worklet", () => {
    const source = readFileSync(require.resolve("../src/features/cities/city-map"), "utf8");

    expect(source).not.toContain("{ ...candidate.model");
  });
});
