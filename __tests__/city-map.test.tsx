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
    expect(screen.getByTestId("china-province-taiwan-inset")).toBeTruthy();
    expect(screen.getByText(/CC BY 4\.0/i)).toBeTruthy();
  });

  it("projects every local marker into the China SVG viewBox rather than the outer map container", () => {
    const adapter = new OfflineChinaMapAdapter();

    for (const marker of adapter.markers) {
      const coordinate = resolveChinaMapCoordinate(marker);
      expect(coordinate.x).toBeGreaterThanOrEqual(0);
      expect(coordinate.x).toBeLessThanOrEqual(774);
      expect(coordinate.y).toBeGreaterThanOrEqual(0);
      expect(coordinate.y).toBeLessThanOrEqual(569);
    }

    expect(resolveChinaMapCoordinate(adapter.markers.find((marker) => marker.city === "hangzhou")!)).toMatchObject({
      x: expect.closeTo(602.03, 2),
      y: expect.closeTo(405.28, 2),
    });
  });

  it("uses the SVG meet content frame for a letterboxed workspace", () => {
    expect(resolveChinaMapContentFrame({ height: 320, width: 480 })).toEqual({
      height: 320,
      scale: 320 / 569,
      width: (774 * 320) / 569,
      x: (480 - (774 * 320) / 569) / 2,
      y: 0,
    });
  });

  it("renders provinces, markers, and labels inside one undistorted China SVG", async () => {
    const screen = await render(<CityMap initialCity="hangzhou" stats={stats} variant="workspace" />);

    expect(screen.getByTestId("city-map-content")).toBeTruthy();
    expect(screen.getByTestId("city-map-marker-dot-jinan-none")).toBeTruthy();
    expect(screen.getByTestId("city-map-label-jinan")).toBeTruthy();
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
    expect(screen.getByTestId("city-map-marker-target-hangzhou-medium")).toBeTruthy();
    expect(screen.getByTestId("city-map-marker-target-shanghai-none")).toBeTruthy();
    expect(screen.queryByText("杭州 · 2 册")).toBeNull();
    expect(screen.queryByText("上海 · 0 册")).toBeNull();
    expect(screen.getByTestId("city-map-marker-beijing-none")).toBeTruthy();
    expect(screen.getByLabelText("北京，已保存 0 册旅行记忆")).toBeTruthy();
  });

  it("resolves every adapter marker into bounded overview geometry", () => {
    const mapWidth = 300;
    const mapHeight = 210;
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

  it("hides workspace labels below the zoom threshold and scales the full marker model on the worklet viewport", () => {
    const markers = new OfflineChinaMapAdapter().markers;
    const size = { height: 210, width: 300 };
    const hiddenModels = resolveWorkspaceMarkerModels(markers, { scale: 1.79, translateX: 0, translateY: 0 }, size);
    const visibleModels = resolveWorkspaceMarkerModels([markers[0]], { scale: 1.8, translateX: 100, translateY: 0 }, size);

    expect(hiddenModels.every((model) => !model.showLabel)).toBe(true);
    expect(visibleModels[0]?.dotSize).toBeCloseTo(14.4);
    expect(visibleModels[0]?.fontSize).toBeCloseTo(19.8);
    expect(visibleModels[0]?.pressSize).toBeCloseTo(79.2);
    expect(visibleModels[0]?.showLabel).toBe(true);
  });

  it("shows only one of two colliding workspace labels", () => {
    const markers = new OfflineChinaMapAdapter().markers;
    const overlappingMarkers = [markers[0], { ...markers[1], coordinate: markers[0].coordinate }];
    const models = resolveWorkspaceMarkerModels(overlappingMarkers, { scale: 2, translateX: 150, translateY: 0 }, { height: 210, width: 300 });

    expect(models.map((model) => model.showLabel)).toEqual([true, false]);
  });

  it("avoids object spread in the UI-thread label collision worklet", () => {
    const source = readFileSync(require.resolve("../src/features/cities/city-map"), "utf8");

    expect(source).not.toContain("{ ...candidate.model");
  });
});
