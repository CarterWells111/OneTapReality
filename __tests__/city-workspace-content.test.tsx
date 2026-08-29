import { act, fireEvent, render } from "@testing-library/react-native";

import { CityWorkspaceContent } from "../src/features/cities/city-workspace-content";
import type { Memory } from "../src/types/memory";

const firstMemory: Memory = {
  city: "hangzhou",
  createdAt: "2026-07-20T10:00:00.000Z",
  id: "first",
  pages: [],
  photoUris: [],
  status: "saved",
  title: "West Lake morning",
  travelDate: "2026-07-20",
  updatedAt: "2026-07-20T10:00:00.000Z",
};

const secondMemory: Memory = { ...firstMemory, id: "second", title: "Tea house", updatedAt: "2026-07-19T10:00:00.000Z" };

describe("CityWorkspaceContent", () => {
  it("shows the selected city's featured local album without NFC content", async () => {
    const screen = await render(
      <CityWorkspaceContent
        city="hangzhou"
        collection={{ city: "hangzhou", featuredMemory: secondMemory, memories: [secondMemory, firstMemory] }}
        onCityPress={() => {}}
        onCreate={() => {}}
        onManage={() => {}}
        onMemoryPress={() => {}}
        width={900}
      />
    );

    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("册旅行记忆")).toBeTruthy();
    expect(screen.getByText("精选相册")).toBeTruthy();
    expect(screen.getByText("Tea house")).toBeTruthy();
    expect(screen.queryByTestId("city-map-workspace")).toBeNull();
    expect(screen.queryByText(/NFC/i)).toBeNull();
  });

  it("sends an empty collection to creation with its city", async () => {
    const onCreate = jest.fn();
    const screen = await render(
      <CityWorkspaceContent
        city="shenzhen"
        collection={{ city: "shenzhen", featuredMemory: null, memories: [] }}
        onCityPress={() => {}}
        onCreate={onCreate}
        onManage={() => {}}
        onMemoryPress={() => {}}
        width={390}
      />
    );

    await act(async () => { fireEvent.press(screen.getByText("开始记录这座城")); });
    expect(onCreate).toHaveBeenCalledWith("shenzhen");
  });

  it("keeps memory navigation and collection management visible", async () => {
    const onManage = jest.fn();
    const onMemoryPress = jest.fn();
    const screen = await render(
      <CityWorkspaceContent
        city="hangzhou"
        collection={{ city: "hangzhou", featuredMemory: firstMemory, memories: [firstMemory] }}
        onCityPress={() => {}}
        onCreate={() => {}}
        onManage={onManage}
        onMemoryPress={onMemoryPress}
        width={390}
      />
    );

    await act(async () => { fireEvent.press(screen.getByLabelText("管理杭州相册")); });
    await act(async () => { fireEvent.press(screen.getByText("West Lake morning")); });
    expect(onManage).toHaveBeenCalledWith("hangzhou");
    expect(onMemoryPress).toHaveBeenCalledWith("first");
  });

  it("presents the local city archive hero and waiting status for an unvisited city", async () => {
    const onCreate = jest.fn();
    const screen = await render(
      <CityWorkspaceContent
        city="beijing"
        collection={{ city: "beijing", featuredMemory: null, memories: [] }}
        onCityPress={() => {}}
        onCreate={onCreate}
        onManage={() => {}}
        onMemoryPress={() => {}}
        width={390}
      />
    );

    expect(screen.getByText("北京")).toBeTruthy();
    expect(screen.getByText("北京市")).toBeTruthy();
    expect(screen.getByText("去胡同拐角喝一杯热茶，把故事留给故宫的风。 ".trim())).toBeTruthy();
    expect(screen.getByTestId("city-archive-hero-illustration-beijing")).toBeTruthy();
    expect(screen.getByText("还在等待你的第一段旅行记忆")).toBeTruthy();
    expect(screen.getByText("开始记录这座城")).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByText("开始记录这座城")); });
    expect(onCreate).toHaveBeenCalledWith("beijing");
  });

  it("shows a featured saved album and expands the remaining saved albums in place", async () => {
    const onMemoryPress = jest.fn();
    const onManage = jest.fn();
    const onCreate = jest.fn();
    const legacyMemory: Memory = { ...firstMemory, id: "legacy", status: undefined, title: "Legacy West Lake" };
    const screen = await render(
      <CityWorkspaceContent
        city="hangzhou"
        collection={{ city: "hangzhou", featuredMemory: legacyMemory, memories: [legacyMemory, secondMemory] }}
        onCityPress={() => {}}
        onCreate={onCreate}
        onManage={onManage}
        onMemoryPress={onMemoryPress}
        width={390}
      />
    );

    expect(screen.getByTestId("city-archive-hero-illustration-hangzhou")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("册旅行记忆")).toBeTruthy();
    expect(screen.getByText("精选相册")).toBeTruthy();
    expect(screen.getByText("Legacy West Lake")).toBeTruthy();
    expect(screen.queryByText("Tea house")).toBeNull();
    expect(screen.getByText("再添一本相册")).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByText("查看全部相册")); });
    await act(async () => { fireEvent.press(screen.getByText("Tea house")); });
    await act(async () => { fireEvent.press(screen.getByLabelText("管理杭州相册")); });
    await act(async () => { fireEvent.press(screen.getByText("再添一本相册")); });
    expect(onMemoryPress).toHaveBeenCalledWith("second");
    expect(onManage).toHaveBeenCalledWith("hangzhou");
    expect(onCreate).toHaveBeenCalledWith("hangzhou");
  });

  it("uses a formal generic hero for cities without a featured watercolor asset", async () => {
    const screen = await render(
      <CityWorkspaceContent
        city="tianjin"
        collection={{ city: "tianjin", featuredMemory: null, memories: [] }}
        onCityPress={() => {}}
        onCreate={() => {}}
        onManage={() => {}}
        onMemoryPress={() => {}}
        width={390}
      />
    );

    expect(screen.getByTestId("city-archive-hero-generic-tianjin")).toBeTruthy();
  });
});
