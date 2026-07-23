import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockIsReady = jest.fn();
const mockMemories = jest.fn();
const mockIsProfileReady = jest.fn();
const mockProfile = jest.fn();
const mockListOrderIntents = jest.fn();

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, [effect]),
  };
});
jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({ memories: mockMemories(), isReady: mockIsReady() }),
}));
jest.mock("../src/features/profile/profile-provider", () => ({
  useProfile: () => ({ profile: mockProfile(), isProfileReady: mockIsProfileReady() }),
}));
jest.mock("../src/features/commerce/shop/order-intent-store", () => ({
  listOrderIntents: (...args: unknown[]) => mockListOrderIntents(...args),
}));

import ProfileScreen from "../src/app/(tabs)/profile";
import { DEFAULT_BIO } from "../src/features/profile/local-profile";

const savedMemory = {
  id: "memory-1",
  title: "我们的西湖周末",
  city: "hangzhou" as const,
  travelDate: "2026-07-20",
  photoUris: ["file://west-lake.jpg", "file://coffee.jpg"],
  pages: [],
  createdAt: "2026-07-20T10:00:00.000Z",
  updatedAt: "2026-07-21T10:00:00.000Z",
};

describe("ProfileScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsReady.mockReturnValue(true);
    mockIsProfileReady.mockReturnValue(true);
    mockProfile.mockReturnValue({ nickname: "小林", avatarUri: null });
    mockListOrderIntents.mockResolvedValue([]);
  });

  it("shows the simplified profile card with the brand slogan as the default bio", async () => {
    mockMemories.mockReturnValue([savedMemory]);
    const screen = await render(<ProfileScreen />);

    expect(screen.getByText("小林")).toBeTruthy();
    expect(screen.getByText(DEFAULT_BIO)).toBeTruthy();
  });

  it("shows a custom bio when the profile has one", async () => {
    mockProfile.mockReturnValue({ nickname: "小林", avatarUri: null, bio: "记录每一次出发" });
    mockMemories.mockReturnValue([]);
    const screen = await render(<ProfileScreen />);

    expect(screen.getByText("记录每一次出发")).toBeTruthy();
  });

  it("shows city, album, and souvenir statistics", async () => {
    mockMemories.mockReturnValue([savedMemory]);
    mockListOrderIntents.mockResolvedValue([{ quantity: 2 }, { quantity: 1 }]);
    const screen = await render(<ProfileScreen />);

    expect(screen.getByText("走过的城市")).toBeTruthy();
    expect(screen.getByText("1 座")).toBeTruthy();
    expect(screen.getByText("珍藏的旅行册")).toBeTruthy();
    expect(screen.getByText("1 册")).toBeTruthy();
    expect(screen.getByText("收入的纪念品")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("3 件")).toBeTruthy());
  });

  it("routes each plain list entry to its destination", async () => {
    mockMemories.mockReturnValue([]);
    const screen = await render(<ProfileScreen />);

    await fireEvent.press(screen.getByText("我的订单"));
    await fireEvent.press(screen.getByText("我的收藏"));
    await fireEvent.press(screen.getByText("去过的城市"));
    await fireEvent.press(screen.getByText("回收站"));
    await fireEvent.press(screen.getByText("意见反馈"));
    await fireEvent.press(screen.getByText("本机数据与隐私声明"));

    expect(mockPush).toHaveBeenNthCalledWith(1, "/shop/orders");
    expect(mockPush).toHaveBeenNthCalledWith(2, "/shop/favorites");
    expect(mockPush).toHaveBeenNthCalledWith(3, "/cities");
    expect(mockPush).toHaveBeenNthCalledWith(4, "/recycle-bin/index");
    expect(mockPush).toHaveBeenNthCalledWith(5, "/feedback/index");
    expect(mockPush).toHaveBeenNthCalledWith(6, "/privacy");
  });

  it("shows a local loading state before SQLite memories are ready", async () => {
    mockIsReady.mockReturnValue(false);
    mockMemories.mockReturnValue([]);

    const screen = await render(<ProfileScreen />);

    expect(screen.getByText("正在读取本地记忆…")).toBeTruthy();
    expect(screen.queryByText("我的订单")).toBeNull();
  });
});
