import { fireEvent, render } from "@testing-library/react-native";

import { CityMap, type CityStats } from "../src/features/cities";

type MarkerFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function getMarkerFrame(style: {
  left: string;
  top: string;
  minHeight: number;
  minWidth: number;
  transform: readonly { translateX?: number; translateY?: number }[];
}): MarkerFrame {
  const translateX = style.transform.find((transform) => transform.translateX !== undefined)?.translateX ?? 0;
  const translateY = style.transform.find((transform) => transform.translateY !== undefined)?.translateY ?? 0;

  return {
    x: (Number.parseFloat(style.left) / 100) * 300 + translateX,
    y: (Number.parseFloat(style.top) / 100) * 210 + translateY,
    width: style.minWidth,
    height: style.minHeight,
  };
}

function framesOverlap(first: MarkerFrame, second: MarkerFrame) {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

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

  it("calls the city callback when an interactive marker is pressed", async () => {
    const onCityPress = jest.fn();
    const screen = await render(<CityMap stats={stats} variant="workspace" interactive onCityPress={onCityPress} />);

    fireEvent.press(screen.getByLabelText("杭州，已保存 2 册旅行记忆"));

    expect(onCityPress).toHaveBeenCalledWith("hangzhou");
  });

  it("keeps nearby Hangzhou and Shanghai 44px overview marker targets separate", async () => {
    const screen = await render(<CityMap stats={stats} variant="overview" />);
    const hangzhouStyle = screen.getByTestId("city-map-marker-hangzhou-medium").props.style;
    const shanghaiStyle = screen.getByTestId("city-map-marker-shanghai-none").props.style;

    expect(hangzhouStyle.minWidth).toBeGreaterThanOrEqual(44);
    expect(hangzhouStyle.minHeight).toBeGreaterThanOrEqual(44);
    expect(shanghaiStyle.minWidth).toBeGreaterThanOrEqual(44);
    expect(shanghaiStyle.minHeight).toBeGreaterThanOrEqual(44);
    expect(framesOverlap(getMarkerFrame(hangzhouStyle), getMarkerFrame(shanghaiStyle))).toBe(false);
  });
});
