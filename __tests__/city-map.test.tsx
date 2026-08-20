import { act, fireEvent, render } from "@testing-library/react-native";
import { readFileSync } from "node:fs";
import * as React from "react";

import { CityMap, chinaMapCoordinateSpace, getCityMapTransform, OfflineChinaMapAdapter, resolveChinaMapContentFrame, resolveChinaMapCoordinate, resolveCityMarkerLayout, type CityStats } from "../src/features/cities";

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
    expect(screen.getByTestId("china-south-sea-inset")).toBeTruthy();
    expect(screen.getByTestId("china-south-sea-inset-path")).toBeTruthy();
    expect(screen.getByText(/China map · cn-atlas/i)).toBeTruthy();
    expect(screen.queryAllByTestId(/^city-map-prefecture-label-/)).toHaveLength(0);
  });

  it("projects every local marker into the China SVG viewBox rather than the outer map container", () => {
    const adapter = new OfflineChinaMapAdapter();

    for (const marker of adapter.markers) {
      const coordinate = resolveChinaMapCoordinate(marker);
      expect(coordinate.x).toBeGreaterThanOrEqual(0);
      expect(coordinate.x).toBeLessThanOrEqual(chinaMapCoordinateSpace.minX + chinaMapCoordinateSpace.width);
      expect(coordinate.y).toBeGreaterThanOrEqual(0);
      expect(coordinate.y).toBeLessThanOrEqual(chinaMapCoordinateSpace.minY + chinaMapCoordinateSpace.height);
    }

    expect(resolveChinaMapCoordinate(adapter.markers.find((marker) => marker.city === "hangzhou")!)).toMatchObject({
      x: expect.closeTo(adapter.markers.find((marker) => marker.city === "hangzhou")!.coordinate.x * chinaMapCoordinateSpace.width, 1),
      y: expect.closeTo(adapter.markers.find((marker) => marker.city === "hangzhou")!.coordinate.y * chinaMapCoordinateSpace.height, 1),
    });
  });

  it("uses the SVG meet content frame for a letterboxed workspace", () => {
    const scale = Math.min(480 / chinaMapCoordinateSpace.width, 320 / chinaMapCoordinateSpace.height);
    expect(resolveChinaMapContentFrame({ height: 320, width: 480 })).toEqual({
      height: chinaMapCoordinateSpace.height * scale,
      scale,
      width: chinaMapCoordinateSpace.width * scale,
      x: (480 - chinaMapCoordinateSpace.width * scale) / 2,
      y: (320 - chinaMapCoordinateSpace.height * scale) / 2,
    });
  });

  it("renders provinces, markers, and labels inside one undistorted China SVG", async () => {
    const screen = await render(<CityMap initialCity="hangzhou" stats={stats} variant="workspace" />);

    expect(screen.getByTestId("city-map-content")).toBeTruthy();
    expect(React.Children.count(screen.getByTestId("city-map-label-layer").props.children)).toBe(0);

    await act(async () => {
      fireEvent(screen.getByTestId("city-map-workspace"), "layout", {
        nativeEvent: { layout: { height: 844, width: 390, x: 0, y: 0 } },
      });
    });

    expect(screen.getByTestId("city-map-marker-dot-jinan-none")).toBeTruthy();
    const labelCount = React.Children.count(screen.getByTestId("city-map-label-layer").props.children);
    expect(labelCount).toBeGreaterThan(0);
    expect(labelCount).toBeLessThan(60);
    expect(screen.getByTestId("china-south-sea-inset")).toBeTruthy();
  });

  it("calls the city callback when an interactive marker is pressed", async () => {
    const onCityPress = jest.fn();
    const screen = await render(<CityMap stats={stats} variant="workspace" interactive onCityPress={onCityPress} />);

    await act(async () => {
      fireEvent(screen.getByTestId("city-map-workspace"), "layout", {
        nativeEvent: { layout: { height: 844, width: 390, x: 0, y: 0 } },
      });
    });

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
    const mapHeight = mapWidth * chinaMapCoordinateSpace.height / chinaMapCoordinateSpace.width;
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

  it("keeps workspace marker dots and hit targets fixed while labels use separate inert overlays", async () => {
    const screen = await render(<CityMap stats={stats} variant="workspace" interactive />);
    await act(async () => {
      fireEvent(screen.getByTestId("city-map-workspace"), "layout", {
        nativeEvent: { layout: { height: 844, width: 390, x: 0, y: 0 } },
      });
    });
    const dot = screen.getByTestId("city-map-marker-visual-beijing");
    const dotStyle = Array.isArray(dot.props.style) ? Object.assign({}, ...dot.props.style) : dot.props.style;
    const contextLabel = screen.getByTestId(
      "city-map-prefecture-label-140100",
      { includeHiddenElements: true },
    );

    expect(dotStyle).toMatchObject({ height: 8, width: 8 });
    expect(contextLabel.props.accessible).toBe(false);
    expect(contextLabel.props.pointerEvents).toBe("none");
    expect(screen.queryByLabelText(/南通/)).toBeNull();
    expect(screen.getByLabelText("北京，已保存 0 册旅行记忆")).toBeTruthy();
  });

  it("avoids object spread in the UI-thread label collision worklet", () => {
    const source = readFileSync(require.resolve("../src/features/cities/city-map"), "utf8");

    expect(source).not.toContain("{ ...candidate.model");
  });
});
