import { fireEvent, render } from "@testing-library/react-native";
import { Alert } from "react-native";

const mockClearAllMemories = jest.fn();
const mockAlert = jest.spyOn(Alert, "alert");

jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({ clearAllMemories: mockClearAllMemories }),
}));

import PrivacyScreen from "../src/app/privacy";

describe("PrivacyScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the factual local-only privacy declaration", async () => {
    const screen = await render(<PrivacyScreen />);

    expect(screen.getByText("本机数据与隐私声明")).toBeTruthy();
    expect(screen.getByText(/照片 URI 和旅行册内容仅保存在本机 SQLite/)).toBeTruthy();
    expect(screen.getByText(/DemoDraftGenerator 不识别人或地点，也不会上传照片/)).toBeTruthy();
    expect(screen.getByText(/Expo Go 仅模拟 NFC/)).toBeTruthy();
  });

  it("confirms before deleting all local data", async () => {
    const screen = await render(<PrivacyScreen />);

    await fireEvent.press(screen.getByText("删除所有本地数据"));

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
});
