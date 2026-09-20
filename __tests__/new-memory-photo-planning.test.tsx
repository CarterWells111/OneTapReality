import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";

import { areDraftPhotoPlansValid } from "../src/features/memories/photo-page-planner";

const mockCreateDraft = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ city: "beijing" }),
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn(), selectionAsync: jest.fn(), NotificationFeedbackType: { Success: "success" } }));
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn(), requestMediaLibraryPermissionsAsync: jest.fn() }));
jest.mock("../src/features/memories/memories-provider", () => ({ useMemories: () => ({ createDraft: mockCreateDraft }) }));

import NewMemoryScreen from "../src/app/memory/new";

describe("new memory photo planning", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockReset();
    mockCreateDraft.mockResolvedValue({ id: "draft-1" });
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        { uri: "file://one.jpg" },
        { uri: "file://two.jpg" },
        { uri: "file://three.jpg" },
        { uri: "file://four.jpg" },
      ],
    });
  });

  it("rejects a draft plan with more than eight photos on one page", () => {
    const nine = Array.from({ length: 9 }, (_, index) => `file://photo-${index + 1}.jpg`);
    expect(areDraftPhotoPlansValid(nine, [{ photoUris: nine }])).toBe(false);
  });

  it("sends two balanced plans with the magazine template when generating", async () => {
    const screen = render(<NewMemoryScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText("从相册选择照片"));
    });
    for (const index of [1, 2, 3, 4]) {
      fireEvent(screen.getByTestId(`new-memory-photo-${index}`), "load");
    }
    fireEvent.press(screen.getByText("一起配置", { exact: true }));
    await waitFor(() => expect(screen.getByText("2 个内容页")).toBeTruthy());

    fireEvent.press(screen.getByText("一起配置", { exact: true }));
    fireEvent.press(screen.getByText("杂志侧栏", { exact: true }));
    fireEvent.press(screen.getByText("应用到全部页面", { exact: true }));
    fireEvent.press(screen.getByText("生成旅行册草稿"));

    await waitFor(() => expect(mockCreateDraft).toHaveBeenCalledTimes(1));
    expect(mockCreateDraft.mock.calls[0][0].pagePlans).toEqual([
      { photoUris: ["file://one.jpg", "file://two.jpg"], photoTemplateId: "magazine-2" },
      { photoUris: ["file://three.jpg", "file://four.jpg"], photoTemplateId: "magazine-2" },
    ]);
  });

  it("shows photo slots immediately and reveals each preview as it loads", async () => {
    const screen = render(<NewMemoryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText("从相册选择照片"));
    });

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
    });
    expect(screen.getByText("正在载入照片，已完成 0 / 4 张")).toBeTruthy();
    expect(screen.getByLabelText("照片 1，正在载入")).toBeTruthy();
    expect(screen.getByLabelText("照片 2，正在载入")).toBeTruthy();
    expect(screen.queryByText("照片排版")).toBeNull();

    fireEvent(screen.getByTestId("new-memory-photo-1"), "load");

    expect(screen.getByText("正在载入照片，已完成 1 / 4 张")).toBeTruthy();
    expect(screen.getByLabelText("照片 1，已载入")).toBeTruthy();
    expect(screen.getByLabelText("照片 2，正在载入")).toBeTruthy();
    expect(screen.queryByText("照片排版")).toBeNull();

    for (const index of [2, 3, 4]) {
      fireEvent(screen.getByTestId(`new-memory-photo-${index}`), "load");
    }

    await waitFor(() => expect(screen.getByText("4 张照片已载入")).toBeTruthy());
    expect(screen.getByText("照片排版")).toBeTruthy();
  });

  it("marks a failed preview and prevents draft generation", async () => {
    const screen = render(<NewMemoryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText("从相册选择照片"));
    });
    fireEvent(screen.getByTestId("new-memory-photo-1"), "error");
    for (const index of [2, 3, 4]) {
      fireEvent(screen.getByTestId(`new-memory-photo-${index}`), "load");
    }

    expect(screen.getByLabelText("照片 1，载入失败")).toBeTruthy();
    expect(screen.getByText("有 1 张照片无法载入，请移除后重新添加。")).toBeTruthy();
    expect(screen.getByText("生成旅行册草稿")).toBeDisabled();
    expect(screen.queryByText("照片排版")).toBeNull();
  });

  it("does not alter photo state when the picker is cancelled", async () => {
    const screen = render(<NewMemoryScreen />);
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({ canceled: true, assets: [] });
    await act(async () => {
      fireEvent.press(screen.getByText("从相册选择照片"));
    });
    expect(screen.queryByText("生成旅行册草稿")).toBeNull();
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  it("appends unique photos without resetting loaded previews or chosen templates", async () => {
    const screen = render(<NewMemoryScreen />);
    await act(async () => fireEvent.press(screen.getByText("从相册选择照片")));
    for (const index of [1, 2, 3, 4]) fireEvent(screen.getByTestId(`new-memory-photo-${index}`), "load");
    fireEvent.press(screen.getByText("一起配置", { exact: true }));
    fireEvent.press(screen.getByText("杂志侧栏", { exact: true }));
    fireEvent.press(screen.getByText("应用到全部页面", { exact: true }));
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({ canceled: true });
    await act(async () => fireEvent.press(screen.getByText("继续添加照片")));
    expect(screen.getByText("4 张照片已载入")).toBeTruthy();
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({ canceled: false, assets: [
      { uri: "file://one.jpg" }, { uri: "file://five.jpg", assetId: "five" }, { uri: "file://five-copy.jpg", assetId: "five" },
    ] });
    await act(async () => fireEvent.press(screen.getByText("继续添加照片")));
    expect(screen.getByText("正在载入照片，已完成 4 / 5 张")).toBeTruthy();
    expect(screen.getByText("生成旅行册草稿")).toBeDisabled();
    fireEvent(screen.getByTestId("new-memory-photo-5"), "load");
    fireEvent.press(screen.getByText("生成旅行册草稿"));
    await waitFor(() => expect(mockCreateDraft).toHaveBeenCalledTimes(1));
    expect(mockCreateDraft.mock.calls[0][0].pagePlans).toEqual([
      { photoUris: ["file://one.jpg", "file://two.jpg"], photoTemplateId: "magazine-2" },
      { photoUris: ["file://three.jpg", "file://four.jpg"], photoTemplateId: "magazine-2" },
      { photoUris: ["file://five.jpg"], photoTemplateId: "classic-1" },
    ]);
  });

  it("removes photos while preserving remaining loads and pages, ignores stale loads, and can start again", async () => {
    const screen = render(<NewMemoryScreen />);
    await act(async () => fireEvent.press(screen.getByText("从相册选择照片")));
    const staleLoad = screen.getByTestId("new-memory-photo-1").props.onLoad;
    fireEvent(screen.getByTestId("new-memory-photo-2"), "load");
    fireEvent.press(screen.getByLabelText("移除照片 1"));
    act(() => staleLoad());
    expect(screen.getByText("正在载入照片，已完成 1 / 3 张")).toBeTruthy();
    for (const index of [2, 3]) fireEvent(screen.getByTestId(`new-memory-photo-${index}`), "load");
    fireEvent.press(screen.getByText("生成旅行册草稿"));
    await waitFor(() => expect(mockCreateDraft).toHaveBeenCalledTimes(1));
    expect(mockCreateDraft.mock.calls[0][0].pagePlans).toEqual([
      { photoUris: ["file://two.jpg"], photoTemplateId: "classic-1" },
      { photoUris: ["file://three.jpg", "file://four.jpg"], photoTemplateId: "classic-2" },
    ]);
    for (let count = 3; count > 0; count--) fireEvent.press(screen.getByLabelText("移除照片 1"));
    expect(screen.queryByText("生成旅行册草稿")).toBeNull();
    await act(async () => fireEvent.press(screen.getByText("从相册选择照片")));
    expect(screen.getByText("正在载入照片，已完成 0 / 4 张")).toBeTruthy();
    act(() => staleLoad());
    expect(screen.getByText("正在载入照片，已完成 0 / 4 张")).toBeTruthy();
  });

  it("preserves per-page count and slot choices through append, removal, and generation", async () => {
    const screen = render(<NewMemoryScreen />);
    await act(async () => fireEvent.press(screen.getByText("从相册选择照片")));
    for (const index of [1, 2, 3, 4]) fireEvent(screen.getByTestId(`new-memory-photo-${index}`), "load");
    expect(screen.getByRole("button", { name: "逐页配置" }).props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(screen.getByLabelText("增加当前页照片数量"));
    fireEvent.press(screen.getByLabelText("槽位 3 的照片前移"));
    fireEvent.press(screen.getByLabelText("杂志侧栏三图模板"));
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file://five.jpg" }] });
    await act(async () => fireEvent.press(screen.getByText("继续添加照片")));
    fireEvent(screen.getByTestId("new-memory-photo-5"), "load");
    fireEvent.press(screen.getByLabelText("移除照片 2"));
    fireEvent.press(screen.getByText("生成旅行册草稿"));
    await waitFor(() => expect(mockCreateDraft).toHaveBeenCalledTimes(1));
    const input = mockCreateDraft.mock.calls[0][0];
    expect(input.pagePlans).toEqual([
      { photoUris: ["file://one.jpg", "file://three.jpg"], photoTemplateId: "magazine-2" },
      { photoUris: ["file://four.jpg"], photoTemplateId: "classic-1" },
      { photoUris: ["file://five.jpg"], photoTemplateId: "classic-1" },
    ]);
    expect(areDraftPhotoPlansValid(input.photoUris, input.pagePlans)).toBe(true);
  });
});
