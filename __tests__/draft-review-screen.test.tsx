import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockReplace = jest.fn();
const mockGetDraftById = jest.fn();
const mockSaveDraft = jest.fn();
const mockRetryDraft = jest.fn();
const mockDiscardDraft = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "draft-1" }),
  useRouter: () => ({ replace: mockReplace }),
}));

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

  it("saves a loaded draft before opening its memory detail", async () => {
    const screen = await render(<DraftReviewScreen />);

    await waitFor(() => {
      expect(screen.getAllByText("West Lake weekend").length).toBeGreaterThan(0);
    });
    await act(async () => {
      fireEvent.press(screen.getByText("保留草稿"));
    });

    await waitFor(() => {
      expect(mockSaveDraft).toHaveBeenCalledWith("draft-1");
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: "/memory/[id]",
        params: { id: "draft-1" },
      });
    });
  });
});
