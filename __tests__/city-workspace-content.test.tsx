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
  it("shows the selected city's featured and ordered local memories without NFC content", async () => {
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

    expect(screen.getByText("2 saved memories")).toBeTruthy();
    expect(screen.getByText("Featured memory")).toBeTruthy();
    expect(screen.getAllByText("Tea house")).toHaveLength(2);
    expect(screen.getByTestId("city-workspace-layout").props.style.flexDirection).toBe("row");
    expect(screen.queryByText(/NFC/i)).toBeNull();
  });

  it("uses the narrow stacked layout and sends an empty collection to creation with its city", async () => {
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

    expect(screen.getByTestId("city-workspace-layout").props.style.flexDirection).toBe("column");
    await act(async () => { fireEvent.press(screen.getByLabelText("Create a 深圳 memory")); });
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

    await act(async () => { fireEvent.press(screen.getByLabelText("Manage 杭州 collection")); });
    await act(async () => { fireEvent.press(screen.getAllByText("West Lake morning")[1]); });
    expect(onManage).toHaveBeenCalledWith("hangzhou");
    expect(onMemoryPress).toHaveBeenCalledWith("first");
  });
});
