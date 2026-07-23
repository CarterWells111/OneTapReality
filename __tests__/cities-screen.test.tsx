import { fireEvent, render } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockMemories = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({ memories: mockMemories(), isReady: true }),
}));

import CitiesScreen from "../src/app/(tabs)/cities";

describe("CitiesScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows the offline map and accessible text fallback with no saved memories", async () => {
    mockMemories.mockReturnValue([]);
    const screen = await render(<CitiesScreen />);

    expect(screen.getByText("城市旅行地图")).toBeTruthy();
    expect(screen.getByText("杭州 · 尚未保存旅行记忆")).toBeTruthy();
    expect(screen.getByText("上海 · 尚未保存旅行记忆")).toBeTruthy();
    expect(screen.getByText("深圳 · 尚未保存旅行记忆")).toBeTruthy();
  });

  it("counts statusless local memories and routes from the fallback city list", async () => {
    mockMemories.mockReturnValue([
      { id: "legacy-hangzhou", city: "hangzhou" },
      { id: "saved-hangzhou", city: "hangzhou", status: "saved" },
    ]);
    const screen = await render(<CitiesScreen />);

    expect(screen.getByText("杭州 · 已保存 2 册旅行记忆")).toBeTruthy();
    fireEvent.press(screen.getByText("杭州 · 已保存 2 册旅行记忆"));

    expect(mockPush).toHaveBeenCalledWith({ pathname: "/city/[city]", params: { city: "hangzhou" } });
  });

  it("opens the native fullscreen map from the explicit map affordance", async () => {
    mockMemories.mockReturnValue([]);
    const screen = await render(<CitiesScreen />);

    fireEvent.press(screen.getByLabelText("全屏查看中国地图"));

    expect(mockPush).toHaveBeenCalledWith("/city-map/index");
  });
});
