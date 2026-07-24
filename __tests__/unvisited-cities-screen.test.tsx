import { fireEvent, render } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockMemories = jest.fn();
const mockIsReady = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({ memories: mockMemories(), isReady: mockIsReady() }),
}));

import UnvisitedCitiesScreen from "../src/app/cities/unvisited";
import { cityContent } from "../src/features/cities/city-content";
import { cities } from "../src/types/city";

describe("UnvisitedCitiesScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsReady.mockReturnValue(true);
  });

  it("shows a local loading state until memories are ready", async () => {
    mockIsReady.mockReturnValue(false);
    mockMemories.mockReturnValue([]);
    const screen = await render(<UnvisitedCitiesScreen />);

    expect(screen.getByText("正在整理城市足迹…")).toBeTruthy();
    expect(screen.queryByText("上海")).toBeNull();
    expect(screen.queryByText("已点亮全部城市")).toBeNull();
  });

  it("lists only unvisited cities and excludes draft and discarded albums from visit counts", async () => {
    mockMemories.mockReturnValue([
      { id: "saved-hangzhou", city: "hangzhou", status: "saved" },
      { id: "draft-shanghai", city: "shanghai", status: "draft" },
      { id: "discarded-shanghai", city: "shanghai", status: "discarded" },
    ]);
    const screen = await render(<UnvisitedCitiesScreen />);

    expect(screen.queryByText("杭州")).toBeNull();
    expect(screen.getByText("上海")).toBeTruthy();
    expect(screen.getByText(cityContent.shanghai.discoverySlogan)).toBeTruthy();
    expect(screen.getAllByText("尚未打卡").length).toBeGreaterThan(0);
    expect(screen.getByTestId("city-card-illustration-shanghai")).toBeTruthy();
    expect(screen.getByTestId("city-card-placeholder-urumqi")).toBeTruthy();
  });

  it("routes to a city's existing detail page when its card is pressed", async () => {
    mockMemories.mockReturnValue([]);
    const screen = await render(<UnvisitedCitiesScreen />);

    fireEvent.press(screen.getByText("上海"));

    expect(mockPush).toHaveBeenCalledWith({ pathname: "/city/[city]", params: { city: "shanghai" } });
  });

  it("shows a completion state when every city has a saved album", async () => {
    mockMemories.mockReturnValue(cities.map((city) => ({ id: `saved-${city}`, city, status: "saved" })));
    const screen = await render(<UnvisitedCitiesScreen />);

    expect(screen.getByText("已点亮全部城市")).toBeTruthy();
  });
});
