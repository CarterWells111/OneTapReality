import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockCreateDraft = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ city: "beijing" }),
  useRouter: () => ({ replace: jest.fn() }),
}));
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn(), selectionAsync: jest.fn(), NotificationFeedbackType: { Success: "success" } }));
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn(), requestMediaLibraryPermissionsAsync: jest.fn() }));
jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({ createDraft: mockCreateDraft }),
}));

import NewMemoryScreen from "../src/app/memory/new";

describe("new memory city selector", () => {
  it("keeps the city deeplink selected and filters grouped native options by city name", async () => {
    const screen = await render(<NewMemoryScreen />);

    expect(screen.getByLabelText("已选城市 北京")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("搜索城市"), "台北");

    await waitFor(() => expect(screen.getByText("台北 · 台湾省")).toBeTruthy());
    expect(screen.queryByText("北京 · 北京市")).toBeNull();
  });
});
