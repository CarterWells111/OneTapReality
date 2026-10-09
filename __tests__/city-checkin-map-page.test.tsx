import { fireEvent, render, waitFor } from "@testing-library/react-native";
import * as React from "react";

import CityCheckinMapScreen from "../src/app/city-map/[city]";
import { getCityCheckinMapImage } from "../src/features/cities/city-checkin-map-images";

let mockParams: { city?: string };
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSetVisited = jest.fn();
let mockVisitedSpotIds: string[] = [];
jest.mock('../src/features/cities/use-city-spot-checkins', () => ({
  useCitySpotCheckins: () => ({visitedSpotIds:mockVisitedSpotIds,isReady:true,isSaving:false,error:'',setVisited:mockSetVisited,retry:jest.fn()}),
}));

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, push: mockPush, replace: mockReplace }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

describe("CityCheckinMapScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVisitedSpotIds = [];
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
    expect(image.props.style).toEqual(expect.arrayContaining([expect.objectContaining({width:'100%',height:'100%'})]));
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

  it('explains the map, opens accessible details and keeps album navigation explicit', () => {
    mockParams={city:'beijing'};
    const screen=render(<CityCheckinMapScreen/>);
    expect(screen.getByText('已打卡 0 / 9')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('打卡地图帮助'));
    expect(screen.getByText(/点击地图上的圆点或景点名称/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('关闭帮助'));
    fireEvent.press(screen.getByLabelText('查看景点列表'));
    fireEvent.press(screen.getByLabelText('1 鸟巢，未打卡'));
    fireEvent.press(screen.getByText('标记已到访'));
    expect(mockSetVisited).toHaveBeenCalledWith('beijing-01',true);
    fireEvent.press(screen.getByText('查看城市相册'));
    expect(mockPush).toHaveBeenCalledWith('/city/beijing');
    fireEvent.press(screen.getByLabelText('查看景点列表'));
    fireEvent.press(screen.getByLabelText('1 鸟巢，未打卡'));
    fireEvent.press(screen.getByText('新建相册'));
    expect(mockPush).toHaveBeenCalledWith('/memory/new?city=beijing');
  });

  it('shows persisted progress and cancellation and opens a scaled map point', () => {
    mockParams={city:'shanghai'}; mockVisitedSpotIds=['shanghai-01'];
    const screen=render(<CityCheckinMapScreen/>);
    expect(screen.getByText('已打卡 1 / 9')).toBeTruthy();
    fireEvent(screen.getByTestId('city-checkin-map-canvas'),'layout',{nativeEvent:{layout:{width:941,height:1672}}});
    fireEvent(screen.getByTestId('city-checkin-map-canvas'),'responderRelease',{nativeEvent:{locationX:400,locationY:412}});
    expect(screen.getByText('东方明珠')).toBeTruthy();
    fireEvent.press(screen.getByText('取消打卡'));
    expect(mockSetVisited).toHaveBeenCalledWith('shanghai-01',false);
  });
});
