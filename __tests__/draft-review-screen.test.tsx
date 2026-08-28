import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";
import { Modal } from "react-native";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockGetDraftById = jest.fn();
const mockSaveDraft = jest.fn();
const mockRetryDraft = jest.fn();
const mockDiscardDraft = jest.fn();
const mockUpdateDraftPages = jest.fn();
const mockPersistSelectedPhoto = jest.fn();
const mockStageSelectedPhoto = jest.fn();

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock("@react-native-community/datetimepicker", () => {
  const React = require("react");
  const { Pressable, Text } = require("react-native");
  return function MockDateTimePicker({ onChange, value }: { onChange: (event: { type: string }, date: Date) => void; value: Date }) {
    const localValue = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    return React.createElement(
      Pressable,
      {
        accessibilityLabel: "测试日期选择器",
        onPress: () => onChange({ type: "set" }, new Date(2026, 7, 21)),
      },
      React.createElement(Text, null, `${localValue} ${value.getHours()}`),
    );
  };
});

jest.mock("expo-router", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    Stack: {
      Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) => (
        <View>{options?.headerRight ? options.headerRight() : null}</View>
      ),
    },
    useLocalSearchParams: () => ({ id: "draft-1" }),
    useRouter: () => ({ push: mockPush, replace: mockReplace }),
  };
});

jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({
    getDraftById: mockGetDraftById,
    saveDraft: mockSaveDraft,
    retryDraft: mockRetryDraft,
    discardDraft: mockDiscardDraft,
    persistSelectedPhoto: mockPersistSelectedPhoto,
    stageSelectedPhoto: mockStageSelectedPhoto,
    updateDraftPages: mockUpdateDraftPages,
  }),
}));

import DraftReviewScreen from "../src/app/memory/review/[id]";

const draft = {
  id: "draft-1",
  title: "West Lake weekend",
  city: "hangzhou" as const,
  travelDate: "2026-07-20",
  photoUris: ["file://west-lake.jpg"],
  pages: [
    {
      id: "cover-1",
      position: 0,
      kind: "cover" as const,
      headline: "West Lake weekend",
      body: "A local demo draft.",
    },
  ],
  createdAt: "2026-07-22T10:00:00.000Z",
  updatedAt: "2026-07-22T10:00:00.000Z",
  status: "draft" as const,
};

describe("DraftReviewScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDraftById.mockResolvedValue(draft);
    mockSaveDraft.mockResolvedValue(undefined);
    mockUpdateDraftPages.mockResolvedValue(undefined);
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///temporary.jpg" }],
    });
    mockPersistSelectedPhoto.mockResolvedValue("file:///permanent.jpg");
    mockStageSelectedPhoto.mockImplementation(async (_memoryId: string, uri: string) => ({
      uri: uri.replace("temporary", "permanent"),
      commit: jest.fn(),
      rollback: jest.fn(async () => undefined),
    }));
  });

  it("saves a loaded draft and opens its completed memory", async () => {
    const screen = render(<DraftReviewScreen />);

    await waitFor(() => {
      expect(screen.getAllByText("West Lake weekend").length).toBeGreaterThan(0);
    });
    await act(async () => {
      fireEvent.press(screen.getByText("保留草稿"));
    });

    await waitFor(() => {
      expect(mockSaveDraft).toHaveBeenCalledWith("draft-1");
      expect(mockReplace).toHaveBeenCalledWith({ pathname: "/memory/[id]", params: { id: "draft-1" } });
    });
  });

  it("keeps regenerate and discard in the header but removes the edit-pencil route", async () => {
    const screen = render(<DraftReviewScreen />);

    await waitFor(() => {
      expect(screen.getAllByText("West Lake weekend").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("重新生成")).toBeNull();
    expect(screen.queryByText("丢弃草稿")).toBeNull();

    expect(screen.queryByLabelText("编辑这册草稿")).toBeNull();
    expect(screen.getByTestId("album-canvas")).toBeTruthy();

    mockRetryDraft.mockResolvedValue(draft);
    await act(async () => {
      fireEvent.press(screen.getByLabelText("重新生成草稿"));
    });
    await waitFor(() => expect(mockRetryDraft).toHaveBeenCalledWith("draft-1"));
  });

  it("waits for the autosave queue before completing confirmation", async () => {
    let finishWrite: () => void = () => undefined;
    mockUpdateDraftPages.mockReturnValueOnce(new Promise<void>((resolve) => {
      finishWrite = resolve;
    }));
    const screen = render(<DraftReviewScreen />);
    await waitFor(() => expect(screen.getByTestId("album-canvas")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("添加贴纸 1-01"));
    await waitFor(() => expect(mockUpdateDraftPages).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByText("保留草稿"));
    expect(mockSaveDraft).not.toHaveBeenCalled();

    await act(async () => finishWrite());
    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalledWith("draft-1"));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/memory/[id]", params: { id: "draft-1" } });
  });

  it("edits and debounces the draft album name before persisting the full snapshot", async () => {
    const screen = render(<DraftReviewScreen />);
    await waitFor(() => expect(screen.getByLabelText("纪念册标题")).toBeTruthy());
    jest.useFakeTimers();

    fireEvent.changeText(screen.getByLabelText("纪念册标题"), "杭州的夏天");
    expect(mockUpdateDraftPages).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await waitFor(() => expect(mockUpdateDraftPages).toHaveBeenCalledWith(
      expect.objectContaining({ title: "杭州的夏天", travelDate: "2026-07-20" }),
      expect.arrayContaining([expect.objectContaining({ id: "cover-1" })]),
    ));
    jest.useRealTimers();
  });

  it("flushes a pending album name when leaving before the debounce expires", async () => {
    const screen = render(<DraftReviewScreen />);
    await waitFor(() => expect(screen.getByLabelText("纪念册标题")).toBeTruthy());
    jest.useFakeTimers();

    fireEvent.changeText(screen.getByLabelText("纪念册标题"), "离开前的新名称");
    screen.unmount();

    await waitFor(() => expect(mockUpdateDraftPages).toHaveBeenCalledWith(
      expect.objectContaining({ title: "离开前的新名称" }),
      expect.arrayContaining([expect.objectContaining({ id: "cover-1" })]),
    ));
    jest.useRealTimers();
  });

  it("does not persist or complete a draft with a blank album name", async () => {
    const screen = render(<DraftReviewScreen />);
    await waitFor(() => expect(screen.getByLabelText("纪念册标题")).toBeTruthy());
    jest.useFakeTimers();

    fireEvent.changeText(screen.getByLabelText("纪念册标题"), "   ");
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    fireEvent.press(screen.getByText("保留草稿"));

    expect(mockUpdateDraftPages).not.toHaveBeenCalled();
    expect(mockSaveDraft).not.toHaveBeenCalled();
    expect(screen.getByText("请输入纪念册标题")).toBeTruthy();
    jest.useRealTimers();
  });

  it("does not persist a blank album name through date or canvas autosaves", async () => {
    const screen = render(<DraftReviewScreen />);
    await waitFor(() => expect(screen.getByLabelText("纪念册标题")).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText("纪念册标题"), "   ");
    fireEvent.press(screen.getByLabelText("选择旅行日期"));
    fireEvent.press(screen.getByLabelText("测试日期选择器"));
    expect(mockUpdateDraftPages).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText("添加贴纸 1-01"));
    expect(mockUpdateDraftPages).not.toHaveBeenCalled();
    expect(screen.getByText("请输入纪念册标题")).toBeTruthy();
  });

  it("keeps queued autosaves immutable when a later title becomes blank", async () => {
    let finishFirstWrite: () => void = () => undefined;
    mockUpdateDraftPages.mockReturnValueOnce(new Promise<void>((resolve) => {
      finishFirstWrite = resolve;
    }));
    const screen = render(<DraftReviewScreen />);
    await waitFor(() => expect(screen.getByTestId("album-canvas")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("添加贴纸 1-01"));
    await waitFor(() => expect(mockUpdateDraftPages).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByLabelText("添加贴纸 1-02"));
    fireEvent.changeText(screen.getByLabelText("纪念册标题"), "   ");

    await act(async () => finishFirstWrite());
    await waitFor(() => expect(mockUpdateDraftPages).toHaveBeenCalledTimes(2));
    expect(mockUpdateDraftPages.mock.calls[1][0]).toEqual(expect.objectContaining({
      title: draft.title,
    }));
  });

  it("edits the draft travel date and persists it immediately", async () => {
    const screen = render(<DraftReviewScreen />);
    await waitFor(() => expect(screen.getByLabelText("选择旅行日期")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("选择旅行日期"));
    fireEvent.press(screen.getByLabelText("测试日期选择器"));

    await waitFor(() => expect(mockUpdateDraftPages).toHaveBeenCalledWith(
      expect.objectContaining({ title: draft.title, travelDate: "2026-08-21" }),
      expect.arrayContaining([expect.objectContaining({ id: "cover-1" })]),
    ));
  });

  it("opens an ISO travel date at local midnight without a UTC offset", async () => {
    const screen = render(<DraftReviewScreen />);
    await waitFor(() => expect(screen.getByLabelText("选择旅行日期")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("选择旅行日期"));

    expect(screen.getByText("2026-07-20 0")).toBeTruthy();
  });

  it("debounces text writes by 400ms and retries a failed latest snapshot", async () => {
    const screen = render(<DraftReviewScreen />);
    await waitFor(() => expect(screen.getByTestId("album-canvas")).toBeTruthy());
    jest.useFakeTimers();

    fireEvent.press(screen.getByTestId("canvas-element-cover-1:headline"));
    fireEvent.press(screen.getByTestId("canvas-element-cover-1:headline"));
    // 需要点击「编辑」按钮手动进入编辑模式
    fireEvent.press(screen.getByText("编辑"));
    fireEvent.changeText(screen.getByLabelText("编辑选中文字"), "新的标题");
    expect(mockUpdateDraftPages).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await waitFor(() => expect(mockUpdateDraftPages).toHaveBeenCalledTimes(1));
    jest.useRealTimers();

    mockUpdateDraftPages.mockRejectedValueOnce(new Error("write failed"));
    fireEvent.press(screen.getByLabelText("添加贴纸 1-01"));
    await waitFor(() => expect(screen.getByText("保存失败·重试")).toBeTruthy());
    mockUpdateDraftPages.mockResolvedValue(undefined);
    fireEvent.press(screen.getByText("保存失败·重试"));
    await waitFor(() => expect(screen.getByText("已自动保存")).toBeTruthy());
  });

  it("stages selected photos in the current draft transaction before adding them", async () => {
    const screen = render(<DraftReviewScreen />);
    await waitFor(() => expect(screen.getByTestId("album-canvas")).toBeTruthy());

    fireEvent.press(screen.getByText("照片与模板"));
    await waitFor(() => expect(screen.getByLabelText("添加一张照片")).toBeTruthy());
    await act(async () => { fireEvent.press(screen.getByLabelText("添加一张照片")); });

    expect(mockStageSelectedPhoto).toHaveBeenCalledWith("draft-1", "file:///temporary.jpg");
    expect(mockPersistSelectedPhoto).not.toHaveBeenCalled();
  });

  it("disables local draft actions while a delayed quick photo is staged", async () => {
    let finishStage!: (photo: { uri: string; commit: jest.Mock; rollback: jest.Mock }) => void;
    const pendingStage = new Promise<{ uri: string; commit: jest.Mock; rollback: jest.Mock }>((resolve) => {
      finishStage = resolve;
    });
    const staged = {
      uri: "file:///permanent-delayed.jpg",
      commit: jest.fn(),
      rollback: jest.fn(async () => undefined),
    };
    mockStageSelectedPhoto.mockReturnValueOnce(pendingStage);
    const screen = render(<DraftReviewScreen />);
    await waitFor(() => expect(screen.getByTestId("album-canvas")).toBeTruthy());

    fireEvent.press(screen.getByText("照片与模板"));
    await waitFor(() => expect(screen.getByLabelText("添加一张照片")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("添加一张照片"));
    await act(async () => undefined);

    expect(screen.getByRole("button", { name: "保留草稿" }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText("重新生成草稿").props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText("丢弃草稿").props.accessibilityState.disabled).toBe(true);

    await act(async () => { finishStage(staged); await pendingStage; });

    expect(staged.commit).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText("应用照片与模板"));
    expect(staged.commit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "保留草稿" }).props.accessibilityState.disabled).toBe(false);
    expect(screen.getByLabelText("重新生成草稿").props.accessibilityState.disabled).toBe(false);
    expect(screen.getByLabelText("丢弃草稿").props.accessibilityState.disabled).toBe(false);
  });

  it("disables draft actions for the full staged photo-layout transaction", async () => {
    const screen = render(<DraftReviewScreen />);
    await waitFor(() => expect(screen.getByTestId("album-canvas")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("打开页面管理"));
    fireEvent.press(screen.getByLabelText("添加页面"));
    fireEvent(screen.UNSAFE_getByType(Modal), "dismiss");
    await waitFor(() => expect(screen.getByText("新建照片页面")).toBeTruthy());
    expect(screen.getByRole("button", { name: "保留草稿" }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText("重新生成草稿").props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText("丢弃草稿").props.accessibilityState.disabled).toBe(true);

    await act(async () => { fireEvent.press(screen.getByLabelText("取消照片布局")); });
    expect(screen.getByRole("button", { name: "保留草稿" }).props.accessibilityState.disabled).toBe(false);
    expect(screen.getByLabelText("重新生成草稿").props.accessibilityState.disabled).toBe(false);
    expect(screen.getByLabelText("丢弃草稿").props.accessibilityState.disabled).toBe(false);
  });
});
