import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { CityCard } from "../src/features/cities/city-card";

describe("CityCard", () => {
  it("places the city copy beside a featured local illustration", async () => {
    const screen = await render(<CityCard city="shanghai" onPress={jest.fn()} variant="visited" visitCount={2} />);

    expect(screen.getByText("上海")).toBeTruthy();
    expect(screen.getByText("已保存 2 册旅行记忆")).toBeTruthy();
    expect(screen.getByTestId("city-card-illustration-shanghai")).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId("city-archive-card-shanghai").props.style)).toMatchObject({ flexDirection: "row", height: 132 });
    expect(StyleSheet.flatten(screen.getByTestId("city-card-visual-shanghai").props.style)).toMatchObject({ height: 100, width: 112 });
  });

  it("uses the same card design with the line placeholder for cities without a checkin map or watercolor", async () => {
    const screen = await render(<CityCard city="lhasa" onPress={jest.fn()} variant="unvisited" />);

    expect(screen.getByText("尚未打卡")).toBeTruthy();
    expect(screen.getByTestId("city-card-placeholder-lhasa")).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId("city-archive-card-lhasa").props.style)).toMatchObject({ flexDirection: "row" });
  });

  it("shows the hand-drawn checkin map as the visual for a city that has one", async () => {
    const screen = await render(<CityCard city="chengdu" onPress={jest.fn()} variant="unvisited" />);

    expect(screen.getByTestId("city-card-illustration-chengdu")).toBeTruthy();
  });
});
