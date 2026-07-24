import { fireEvent, render } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockMemories = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({ memories: mockMemories(), isReady: true }),
}));

import CitiesScreen from "../src/app/(tabs)/cities";
import { cities } from "../src/types/city";

type RenderedNode = {
  readonly children?: readonly (RenderedNode | string)[] | null;
  readonly props?: { readonly testID?: string };
};

function isRenderedNodeList(node: RenderedNode | readonly RenderedNode[] | null): node is readonly RenderedNode[] {
  return Array.isArray(node);
}

function findParentWithChildTestId(node: RenderedNode | readonly RenderedNode[] | null, testID: string): RenderedNode | undefined {
  if (node === null) return undefined;
  if (isRenderedNodeList(node)) {
    for (const child of node) {
      const parent = findParentWithChildTestId(child, testID);
      if (parent) return parent;
    }
    return undefined;
  }

  const children = node.children?.filter((child): child is RenderedNode => typeof child !== "string") ?? [];
  if (children.some((child) => child.props?.testID === testID)) return node;

  for (const child of children) {
    const parent = findParentWithChildTestId(child, testID);
    if (parent) return parent;
  }
  return undefined;
}

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

  it("prioritizes visited city files, counts saved memories, and routes from the city card", async () => {
    mockMemories.mockReturnValue([
      { id: "legacy-hangzhou", city: "hangzhou" },
      { id: "saved-hangzhou", city: "hangzhou", status: "saved" },
    ]);
    const screen = await render(<CitiesScreen />);

    expect(screen.getByText("杭州")).toBeTruthy();
    expect(screen.getByText("已保存 2 册旅行记忆")).toBeTruthy();
    expect(screen.getByTestId("city-archive-card-shanghai")).toBeTruthy();
    fireEvent.press(screen.getByText("杭州"));

    expect(mockPush).toHaveBeenCalledWith({ pathname: "/city/[city]", params: { city: "hangzhou" } });
  });

  it("shows five archive cards at most and keeps the More Cities entry as the sixth card", async () => {
    mockMemories.mockReturnValue(cities.slice(0, 8).map((city, index) => ({
      id: `saved-${city}`,
      city,
      status: "saved",
      createdAt: `2026-07-${String(index + 10).padStart(2, "0")}T09:00:00.000Z`,
    })));
    const screen = await render(<CitiesScreen />);

    const cityCards = screen.getAllByTestId(/city-archive-card-/);
    const moreCitiesEntry = screen.getByTestId("more-cities-entry");
    const archiveList = findParentWithChildTestId(screen.toJSON(), "more-cities-entry");

    expect(cityCards).toHaveLength(5);
    expect(archiveList?.children).toHaveLength(6);
    expect(archiveList?.children?.map((child) => typeof child === "string" ? undefined : child.props?.testID)).toEqual([
      ...cityCards.map((card) => card.props.testID),
      moreCitiesEntry.props.testID,
    ]);
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
