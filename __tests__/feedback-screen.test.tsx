import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockBack = jest.fn();
const mockOpenUrl = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack }) }));

import { FeedbackScreen } from "../src/app/feedback";

describe("FeedbackScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenUrl.mockResolvedValue(undefined);
  });

  it("offers support email and TestFlight screenshot feedback without commerce questions", () => {
    render(<FeedbackScreen openUrl={mockOpenUrl} appVersion="1.1.2" deviceName="iPhone" system="ios 18.6" />);

    expect(screen.getByText("support@onetapreality.com")).toBeTruthy();
    expect(screen.getByText(/TestFlight.*截图/u)).toBeTruthy();
    expect(screen.queryByText(/购买|价位|材料|配送/u)).toBeNull();
  });

  it("says only that the mail app opened, never that feedback was submitted", async () => {
    render(<FeedbackScreen openUrl={mockOpenUrl} appVersion="1.1.2" deviceName="iPhone" system="ios 18.6" />);

    await act(async () => fireEvent.press(screen.getByText("打开反馈邮件")));

    expect(screen.getByText("邮件应用已打开，请检查内容并亲自发送。")).toBeTruthy();
    expect(screen.queryByText(/已提交|提交成功|已发送/u)).toBeNull();
  });

  it("shows a stable action when no mail app can open the URL", async () => {
    mockOpenUrl.mockRejectedValue(new Error("raw mail failure"));
    render(<FeedbackScreen openUrl={mockOpenUrl} appVersion="1.1.2" deviceName="iPhone" system="ios 18.6" />);

    await act(async () => fireEvent.press(screen.getByText("打开反馈邮件")));

    expect(screen.getByText("无法打开邮件应用，请直接发送邮件到 support@onetapreality.com。")).toBeTruthy();
    expect(screen.queryByText(/raw mail failure/u)).toBeNull();
  });
});
