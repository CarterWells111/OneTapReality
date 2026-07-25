import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockGetDraftById = jest.fn();
const mockSaveDraft = jest.fn();
const mockRetryDraft = jest.fn();
const mockDiscardDraft = jest.fn();
const mockUpdateDraftPages = jest.fn();

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
  });

  it("saves a loaded draft and returns straight to the home tab", async () => {
    const screen = render(<DraftReviewScreen />);

    await waitFor(() => {
      expect(screen.getAllByText("West Lake weekend").length).toBeGreaterThan(0);
    });
    await act(async () => {
      fireEvent.press(screen.getByText("保留草稿"));
    });

    await waitFor(() => {
      expect(mockSaveDraft).toHaveBeenCalledWith("draft-1");
      expect(mockReplace).toHaveBeenCalledWith("/");
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
    expect(mockReplace).toHaveBeenCalledWith("/");
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
});
