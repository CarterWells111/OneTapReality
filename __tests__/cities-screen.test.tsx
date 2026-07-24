import { fireEvent, render } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockMemories = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({ memories: mockMemories(), isReady: true }),
}));

import CitiesScreen from "../src/app/(tabs)/cities";
import { cities } from "../src/types/city";

describe("CitiesScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows the offline map and an entry to browse unvisited cities with no saved memories", async () => {
    mockMemories.mockReturnValue([]);
    const screen = await render(<CitiesScreen />);

    expect(screen.getByText("城市旅行地图")).toBeTruthy();
    expect(screen.getByText("查看更多城市")).toBeTruthy();
  });

  it("only shows visited city files, counts saved memories, and routes from the city card", async () => {
    mockMemories.mockReturnValue([
      { id: "legacy-hangzhou", city: "hangzhou" },
      { id: "saved-hangzhou", city: "hangzhou", status: "saved" },
    ]);
    const screen = await render(<CitiesScreen />);

    expect(screen.getByText("杭州")).toBeTruthy();
    expect(screen.getByText("已保存 2 册旅行记忆")).toBeTruthy();
    expect(screen.queryByText("上海")).toBeNull();
    fireEvent.press(screen.getByText("杭州"));

    expect(mockPush).toHaveBeenCalledWith({ pathname: "/city/[city]", params: { city: "hangzhou" } });
  });

  it("routes to the unvisited cities browser from the city files entry", async () => {
    mockMemories.mockReturnValue([]);
    const screen = await render(<CitiesScreen />);

    fireEvent.press(screen.getByText("查看更多城市"));

    expect(mockPush).toHaveBeenCalledWith("/cities/unvisited");
  });

  it("keeps the unvisited cities entry visible after every city has a saved or legacy album", async () => {
    mockMemories.mockReturnValue(cities.map((city, index) => (
      index === 0
        ? { id: `legacy-${city}`, city }
        : { id: `saved-${city}`, city, status: "saved" }
    )));
    const screen = await render(<CitiesScreen />);

    expect(screen.getByText("查看更多城市")).toBeTruthy();
  });

  it("opens the native fullscreen map from the explicit map affordance", async () => {
    mockMemories.mockReturnValue([]);
    const screen = await render(<CitiesScreen />);

    fireEvent.press(screen.getByLabelText("全屏查看中国地图"));

    expect(mockPush).toHaveBeenCalledWith("/city-map");
  });
});
