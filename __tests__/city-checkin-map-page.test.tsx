import { fireEvent, render } from "@testing-library/react-native";
import * as React from "react";

import CityCheckinMapScreen from "../src/app/city-map/[city]";
import { getCityCheckinMapImage } from "../src/features/cities/city-checkin-map-images";

let mockParams: { city?: string };
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

describe("CityCheckinMapScreen", () => {
  it("renders the curated illustrated map for a city that has an image", async () => {
    mockParams = { city: "wuhan" };
    const screen = await render(<CityCheckinMapScreen />);

    expect(screen.getByTestId("city-checkin-map-screen")).toBeTruthy();
    expect(screen.getByText("武汉")).toBeTruthy();
    expect(screen.queryByTestId("city-checkin-map-placeholder")).toBeNull();
    const image = screen.getByTestId("city-checkin-map-image");
    expect(image.props.source).toBe(getCityCheckinMapImage("wuhan"));
    expect(image.props.accessibilityLabel).toBe("武汉城市打卡地图");
  });

  it("shows a graceful fallback for a city without a curated image", async () => {
    mockParams = { city: "lhasa" };
    const screen = await render(<CityCheckinMapScreen />);

    expect(screen.getByTestId("city-checkin-map-placeholder")).toBeTruthy();
    expect(screen.queryByTestId("city-checkin-map-image")).toBeNull();
    expect(screen.getAllByText("拉萨").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("打卡地图筹备中")).toBeTruthy();
  });

  it("closes the screen through the close button", async () => {
    mockParams = { city: "changsha" };
    const screen = await render(<CityCheckinMapScreen />);

    fireEvent.press(screen.getByTestId("city-checkin-map-close"));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
