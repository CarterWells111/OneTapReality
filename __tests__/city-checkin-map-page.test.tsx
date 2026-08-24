import { fireEvent, render, waitFor } from "@testing-library/react-native";
import * as React from "react";

import CityCheckinMapScreen from "../src/app/city-map/[city]";
import { getCityCheckinMapImage } from "../src/features/cities/city-checkin-map-images";

let mockParams: { city?: string };
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: mockReplace }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

describe("CityCheckinMapScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the curated illustrated map for a city that has an image", async () => {
    mockParams = { city: "wuhan" };
    const screen = await render(<CityCheckinMapScreen />);

    expect(screen.getByTestId("city-checkin-map-screen")).toBeTruthy();
    expect(screen.getByText("武汉")).toBeTruthy();
    expect(screen.queryByTestId("city-checkin-map-generic")).toBeNull();
    const image = screen.getByTestId("city-checkin-map-image");
    expect(image.props.source).toBe(getCityCheckinMapImage("wuhan"));
    expect(image.props.accessibilityLabel).toBe("武汉城市打卡地图");
  });

  it("redirects a city without a curated map to its complete city archive", async () => {
    mockParams = { city: "lhasa" };
    const screen = await render(<CityCheckinMapScreen />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/city/lhasa"));
    expect(screen.queryByTestId("city-checkin-map-image")).toBeNull();
    expect(screen.queryByText("这座城市的专属地图正在准备中")).toBeNull();
  });

  it("closes the screen through the close button", async () => {
    mockParams = { city: "changsha" };
    const screen = await render(<CityCheckinMapScreen />);

    fireEvent.press(screen.getByTestId("city-checkin-map-close"));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
