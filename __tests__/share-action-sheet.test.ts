import { Alert } from "react-native";

jest.mock("expo-file-system/legacy", () => ({
  __esModule: true,
  cacheDirectory: "file:///cache/",
  copyAsync: jest.fn(),
}));
jest.mock("expo-print", () => ({ __esModule: true, printToFileAsync: jest.fn() }));
jest.mock("expo-sharing", () => ({
  __esModule: true,
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));
jest.mock("../src/features/export/page-capture-provider", () => ({
  __esModule: true,
  capturePagesAsImages: jest.fn(),
}));

import { showShareActionSheet } from "../src/features/export/share-action-sheet";

const { capturePagesAsImages: mockCapturePagesAsImages } = jest.requireMock("../src/features/export/page-capture-provider") as { capturePagesAsImages: jest.Mock };
const { copyAsync: mockCopyAsync } = jest.requireMock("expo-file-system/legacy") as { copyAsync: jest.Mock };
const { printToFileAsync: mockPrintToFileAsync } = jest.requireMock("expo-print") as { printToFileAsync: jest.Mock };
const { isAvailableAsync: mockIsAvailableAsync, shareAsync: mockShareAsync } = jest.requireMock("expo-sharing") as { isAvailableAsync: jest.Mock; shareAsync: jest.Mock };

describe("travel-book share action sheet", () => {
  const alertSpy = jest.spyOn(Alert, "alert");

  beforeEach(() => {
    jest.clearAllMocks();
    mockCapturePagesAsImages.mockResolvedValue(["data:image/png;base64,test"]);
    mockPrintToFileAsync.mockResolvedValue({ uri: "file:///cache/original.pdf" });
    mockIsAvailableAsync.mockResolvedValue(true);
  });

  async function choosePdf() {
    await showShareActionSheet({
      title: "夏日旅行",
      pages: [{ id: "page-1", kind: "cover", headline: "夏日", body: "杭州", position: 0 }],
    });
    const buttons = alertSpy.mock.calls[0][2] ?? [];
    const pdfOption = buttons.find((button) => button.text === "导出为 PDF");
    if (!pdfOption?.onPress) throw new Error("PDF export action is missing");
    await pdfOption.onPress();
  }

  it("generates, copies, and shares a PDF", async () => {
    await choosePdf();

    expect(mockPrintToFileAsync).toHaveBeenCalledTimes(1);
    expect(mockCopyAsync).toHaveBeenCalledWith({ from: "file:///cache/original.pdf", to: "file:///cache/夏日旅行.pdf" });
    expect(mockShareAsync).toHaveBeenCalledWith("file:///cache/夏日旅行.pdf", expect.objectContaining({ mimeType: "application/pdf" }));
  });

  it("explains where the PDF was generated when sharing is unavailable", async () => {
    mockIsAvailableAsync.mockResolvedValue(false);

    await choosePdf();

    expect(alertSpy).toHaveBeenLastCalledWith("PDF 已生成", expect.stringContaining("夏日旅行.pdf"));
  });

  it("shows an export error when PDF generation fails", async () => {
    mockPrintToFileAsync.mockRejectedValue(new Error("printer unavailable"));

    await choosePdf();

    expect(alertSpy).toHaveBeenLastCalledWith("导出失败", "printer unavailable");
  });
});
