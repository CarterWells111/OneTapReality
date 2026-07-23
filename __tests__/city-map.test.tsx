import { act, fireEvent, render } from "@testing-library/react-native";

import { CityMap, getCityMapTransform, OfflineChinaMapAdapter, resolveCityMarkerLayout, type CityStats } from "../src/features/cities";

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

    expect(provinces.length).toBeGreaterThanOrEqual(30);
    expect(provinces.every((province) => province.props.strokeWidth > 0)).toBe(true);
    expect(screen.getByText(/CC BY 4\.0/i)).toBeTruthy();
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

  it("keeps every overview marker accessible while only labelling visited cities", async () => {
    const screen = await render(<CityMap stats={stats} variant="overview" />);
    const hangzhouStyle = screen.getByTestId("city-map-marker-hangzhou-medium").props.style;
    const shanghaiStyle = screen.getByTestId("city-map-marker-shanghai-none").props.style;

    expect(hangzhouStyle.minWidth).toBeGreaterThanOrEqual(44);
    expect(hangzhouStyle.minHeight).toBeGreaterThanOrEqual(44);
    expect(shanghaiStyle.minWidth).toBeGreaterThanOrEqual(44);
    expect(shanghaiStyle.minHeight).toBeGreaterThanOrEqual(44);
    expect(screen.getByText("杭州 · 2 册")).toBeTruthy();
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
});
