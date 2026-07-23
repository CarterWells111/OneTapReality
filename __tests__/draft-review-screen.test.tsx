import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockGetDraftById = jest.fn();
const mockSaveDraft = jest.fn();
const mockRetryDraft = jest.fn();
const mockDiscardDraft = jest.fn();

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
  });

  it("saves a loaded draft and returns straight to the home tab", async () => {
    const screen = await render(<DraftReviewScreen />);

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

  it("keeps regenerate, edit, and discard as header icon actions only", async () => {
    const screen = await render(<DraftReviewScreen />);

    await waitFor(() => {
      expect(screen.getAllByText("West Lake weekend").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("重新生成")).toBeNull();
    expect(screen.queryByText("丢弃草稿")).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("编辑这册草稿"));
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/memory/[id]/edit",
      params: { id: "draft-1" },
    });

    mockRetryDraft.mockResolvedValue(draft);
    await act(async () => {
      fireEvent.press(screen.getByLabelText("重新生成草稿"));
    });
    await waitFor(() => expect(mockRetryDraft).toHaveBeenCalledWith("draft-1"));
  });
});
