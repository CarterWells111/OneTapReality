import { fireEvent, render } from "@testing-library/react-native";
import { Alert } from "react-native";

const mockPush = jest.fn();
const mockClearAllMemories = jest.fn();
const mockIsReady = jest.fn();
const mockMemories = jest.fn();
const mockAlert = jest.spyOn(Alert, "alert");

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({ memories: mockMemories(), isReady: mockIsReady(), clearAllMemories: mockClearAllMemories }),
}));

import ProfileScreen from "../src/app/(tabs)/profile";

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
  });

  it("shows archive statistics and routes the recent memory and next actions", async () => {
    mockMemories.mockReturnValue([savedMemory]);
    const screen = await render(<ProfileScreen />);

    expect(screen.getByText("我们的旅行档案")).toBeTruthy();
    expect(screen.getByText("1 册")).toBeTruthy();
    expect(screen.getByText("旅行记忆")).toBeTruthy();
    expect(screen.getByText("1 座")).toBeTruthy();
    expect(screen.getByText("城市足迹")).toBeTruthy();
    expect(screen.getByText("2 张")).toBeTruthy();
    expect(screen.getByText("已收录照片")).toBeTruthy();

    await fireEvent.press(screen.getByText("我们的西湖周末"));
    await fireEvent.press(screen.getByText("继续创建旅行册"));
    await fireEvent.press(screen.getByText("查看城市收藏"));
    await fireEvent.press(screen.getByText("把这册回忆做成礼物"));

    expect(mockPush).toHaveBeenNthCalledWith(1, { pathname: "/memory/[id]", params: { id: "memory-1" } });
    expect(mockPush).toHaveBeenNthCalledWith(2, "/memory/new");
    expect(mockPush).toHaveBeenNthCalledWith(3, "/cities");
    expect(mockPush).toHaveBeenNthCalledWith(4, { pathname: "/memory/[id]", params: { id: "memory-1" } });
  });

  it("shows the first-trip action and preserves confirmation before clearing local data", async () => {
    mockMemories.mockReturnValue([]);
    const screen = await render(<ProfileScreen />);

    expect(screen.getByText("从第一段旅程开始")).toBeTruthy();
    expect(screen.queryByText("把这册回忆做成礼物")).toBeNull();

    await fireEvent.press(screen.getByText("从第一段旅程开始"));
    await fireEvent.press(screen.getByText("删除所有本地数据"));

    expect(mockPush).toHaveBeenCalledWith("/memory/new");
    expect(mockAlert).toHaveBeenCalledWith(
      "删除所有本地记忆？",
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ style: "destructive" })]),
    );
    expect(mockClearAllMemories).not.toHaveBeenCalled();
    const buttons = mockAlert.mock.calls[0][2] ?? [];
    const destructiveButton = buttons.find((button) => button.style === "destructive");
    destructiveButton?.onPress?.();
    expect(mockClearAllMemories).toHaveBeenCalledTimes(1);
  });

  it("shows a local loading state before SQLite memories are ready", async () => {
    mockIsReady.mockReturnValue(false);
    mockMemories.mockReturnValue([]);

    const screen = await render(<ProfileScreen />);

    expect(screen.getByText("正在读取本地记忆…")).toBeTruthy();
    expect(screen.queryByText("从第一段旅程开始")).toBeNull();
  });
});
