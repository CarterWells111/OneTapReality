import { fireEvent, render } from "@testing-library/react-native";

const mockShare = jest.fn();
const mockUseAuth = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("../src/features/auth/auth-provider", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({
    discardMemory: jest.fn(),
    isReady: true,
    memories: [
      { id: "one", title: "第一册", city: "hangzhou", travelDate: "2026-01-01", photoUris: [], pages: [], createdAt: "2026-01-01", updatedAt: "2026-01-01" },
      { id: "two", title: "第二册", city: "shanghai", travelDate: "2026-01-02", photoUris: [], pages: [], createdAt: "2026-01-02", updatedAt: "2026-01-02" },
    ],
  }),
}));
jest.mock("../src/features/export/share-action-sheet", () => ({ showShareActionSheet: (...args: unknown[]) => mockShare(...args) }));

import MemoriesHomeScreen from "../src/app/(tabs)";

describe("home share selection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: { id: "user", email: "user@example.com" } });
  });

  it("shares exactly one selected travel book", () => {
    const view = render(<MemoriesHomeScreen />);

    fireEvent(view.getByLabelText("打开旅行册 第一册"), "longPress");
    fireEvent.press(view.getByLabelText("分享所选"));

    expect(mockShare).toHaveBeenCalledTimes(1);
    expect(mockShare).toHaveBeenCalledWith(expect.objectContaining({ title: "第一册" }));
  });

  it("disables sharing and gives an actionable prompt when multiple books are selected", () => {
    const view = render(<MemoriesHomeScreen />);

    fireEvent(view.getByLabelText("打开旅行册 第一册"), "longPress");
    fireEvent.press(view.getByLabelText("打开旅行册 第二册"));

    expect(view.getByLabelText("分享所选").props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(view.getByText("一次只能分享一本，请只保留一本旅行册。")).toBeTruthy();
    fireEvent.press(view.getByLabelText("分享所选"));
    expect(mockShare).not.toHaveBeenCalled();
  });
});
