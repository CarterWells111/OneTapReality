import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

import { areDraftPhotoPlansValid } from "../src/features/memories/photo-page-planner";
import { DraftCreationError } from "../src/features/memories/draft-creation-error";

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
    mockReplace.mockReset();
    mockCreateDraft.mockReset();
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

  async function readyToGenerate() {
    const screen = render(<NewMemoryScreen />);
    await act(async () => fireEvent.press(screen.getByText("从相册选择照片")));
    for (const index of [1, 2, 3, 4]) {
      fireEvent(screen.getByTestId(`new-memory-photo-${index}`), "load");
    }
    return screen;
  }

  it("shows a safe fallback without exposing an unknown creation error", async () => {
    mockCreateDraft.mockRejectedValueOnce(new Error("file:///private/photo.jpg token=secret user@example.com"));
    const screen = await readyToGenerate();

    await act(async () => fireEvent.press(screen.getByText("生成旅行册草稿")));

    expect(screen.getByText("无法创建旅行册草稿，请稍后重试；若仍失败，请联系支持。")).toBeTruthy();
    expect(screen.queryByText(/private|secret|user@example/)).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("clears the previous error when a creation retry succeeds", async () => {
    mockCreateDraft.mockRejectedValueOnce(new Error("unknown failure"));
    const screen = await readyToGenerate();

    await act(async () => fireEvent.press(screen.getByText("生成旅行册草稿")));
    expect(screen.getByText("无法创建旅行册草稿，请稍后重试；若仍失败，请联系支持。")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText("生成旅行册草稿")));

    expect(screen.queryByText("无法创建旅行册草稿，请稍后重试；若仍失败，请联系支持。")).toBeNull();
    expect(mockCreateDraft).toHaveBeenCalledTimes(2);
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/memory/review/[id]", params: { id: "draft-1" } });
  });

  it.each([
    { name: "photo import", error: new DraftCreationError("photo-import", new Error("unknown"), { photoNumber: 3 }), message: "导入第 3 张照片时失败。请重新选择该照片后重试；若仍失败，请联系支持。" },
    { name: "layout", error: new DraftCreationError("layout", new Error("unknown")), message: "生成旅行册页面时失败。请调整页面布局后重试；若仍失败，请联系支持。" },
    { name: "photo references", error: new DraftCreationError("photo-reference", new Error("unknown")), message: "准备旅行册照片时失败。请重新选择照片后重试；若仍失败，请联系支持。" },
    { name: "storage", error: new DraftCreationError("storage", new Error("unknown")), message: "保存旅行册草稿时失败。请稍后重试；若仍失败，请联系支持。" },
    { name: "invalid title", error: new Error("请输入纪念册标题"), message: "请输入纪念册标题。" },
    { name: "library not ready", error: new Error("本机旅行册仍在准备中"), message: "本机旅行册仍在准备中，请稍后再试。" },
    { name: "library switched", error: new Error("本机旅行册已经切换，请重新操作"), message: "本机旅行册已经切换，请重新打开创建页面后重试。" },
  ])("shows the corresponding message for $name", async ({ error, message }) => {
    mockCreateDraft.mockRejectedValueOnce(error);
    const screen = await readyToGenerate();

    await act(async () => fireEvent.press(screen.getByText("生成旅行册草稿")));

    expect(screen.getByText(message)).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("opens the saved draft and reports a failed draft-list refresh", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockCreateDraft.mockResolvedValueOnce({ id: "draft-1", creationWarning: "list-refresh" });
    const screen = await readyToGenerate();

    await act(async () => fireEvent.press(screen.getByText("生成旅行册草稿")));

    expect(alert).toHaveBeenCalledWith("草稿已保存", "草稿已保存，但草稿箱刷新失败。你可以继续编辑，返回首页后再试。");
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/memory/review/[id]", params: { id: "draft-1" } });
    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it("reports navigation failure as already saved and retries opening without creating a duplicate", async () => {
    mockReplace.mockImplementationOnce(() => { throw new Error("Navigation failed for draft-private-id"); });
    const screen = await readyToGenerate();

    await act(async () => fireEvent.press(screen.getByText("生成旅行册草稿")));

    expect(screen.getByText("草稿已保存，但无法打开编辑页。请返回首页，从草稿箱打开。")).toBeTruthy();
    expect(screen.queryByText(/draft-private-id/)).toBeNull();
    expect(screen.getByLabelText("纪念册标题").props.editable).toBe(false);
    expect(screen.getByText("继续添加照片")).toBeDisabled();
    expect(screen.queryByText("照片排版")).toBeNull();
    await act(async () => fireEvent.press(screen.getByText("打开已保存草稿")));
    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("草稿已保存，但无法打开编辑页。请返回首页，从草稿箱打开。")).toBeNull();
  });

  it("contains a cover-picker rejection and lets the user retry", async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockRejectedValueOnce(new Error("file:///private/cover.jpg"));
    const screen = render(<NewMemoryScreen />);

    await act(async () => fireEvent.press(screen.getByLabelText("上传封面图片")));

    expect(screen.getByText("无法选择封面图片，请重试。")).toBeTruthy();
    expect(screen.queryByText(/private\/cover/)).toBeNull();
    await act(async () => fireEvent.press(screen.getByLabelText("上传封面图片")));
    expect(screen.queryByText("无法选择封面图片，请重试。")).toBeNull();
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  it("shows a safe photo-picker error and clears it after choosing photos", async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockRejectedValueOnce(new Error("file:///private/photo.jpg"));
    const screen = render(<NewMemoryScreen />);

    await act(async () => fireEvent.press(screen.getByText("从相册选择照片")));

    expect(screen.getByText("无法选择照片，请重试。")).toBeTruthy();
    expect(screen.queryByText(/private\/photo/)).toBeNull();
    await act(async () => fireEvent.press(screen.getByText("从相册选择照片")));
    expect(screen.queryByText("无法选择照片，请重试。")).toBeNull();
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
