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
    await waitFor(() => expect(screen.getByText("2 个内容页")).toBeTruthy());

    fireEvent.press(screen.getByText("杂志侧栏", { exact: true }));
    fireEvent.press(screen.getByText("应用到全部页面", { exact: true }));
    fireEvent.press(screen.getByText("生成旅行册草稿"));

    await waitFor(() => expect(mockCreateDraft).toHaveBeenCalledTimes(1));
    expect(mockCreateDraft.mock.calls[0][0].pagePlans).toEqual([
      { photoUris: ["file://one.jpg", "file://two.jpg"], photoTemplateId: "magazine-2" },
      { photoUris: ["file://three.jpg", "file://four.jpg"], photoTemplateId: "magazine-2" },
    ]);
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
});
