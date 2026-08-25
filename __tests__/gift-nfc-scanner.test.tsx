import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import { GiftNfcScanner } from "../src/features/gifts/gift-nfc-scanner";
import type { GiftLinkScanner } from "../src/services/nfc/gift-link-scanner";

const mockPush = jest.fn();
const TOKEN = "Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

function makeScanner(): GiftLinkScanner {
  return {
    cancel: jest.fn(async () => undefined),
    scan: jest.fn(async () => ({ pathname: `/gift/${TOKEN}` as const, token: TOKEN })),
  };
}

describe("GiftNfcScanner", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the old-device in-app scan entry and uses the Universal Link route", async () => {
    const scanner = makeScanner();
    const screen = render(<GiftNfcScanner scanner={scanner} />);

    await act(async () => fireEvent.press(screen.getByText("扫描礼品")));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/gift/${TOKEN}` as never));
  });

  it("cancels the NFC session when its UI unmounts", () => {
    const scanner = makeScanner();
    const screen = render(<GiftNfcScanner scanner={scanner} />);

    screen.unmount();

    expect(scanner.cancel).toHaveBeenCalledTimes(1);
  });

  it("shows an actionable generic message without rendering the scanned URL", async () => {
    const scanner = makeScanner();
    jest.mocked(scanner.scan).mockRejectedValue(Object.assign(new Error("secret raw URL"), { code: "NFC_GIFT_LINK_INVALID" }));
    const screen = render(<GiftNfcScanner scanner={scanner} />);

    await act(async () => fireEvent.press(screen.getByText("扫描礼品")));

    await waitFor(() => expect(screen.getByText("未识别到有效的 OneTapReality 礼品卡，请重试。")).toBeTruthy());
    expect(screen.queryByText("secret raw URL")).toBeNull();
  });

  it("explains that Expo Go cannot load the NFC native module", async () => {
    const scanner = makeScanner();
    jest.mocked(scanner.scan).mockRejectedValue(Object.assign(new Error("native module missing"), { code: "NFC_NATIVE_BUILD_REQUIRED" }));
    const screen = render(<GiftNfcScanner scanner={scanner} />);

    await act(async () => fireEvent.press(screen.getByText("扫描礼品")));

    await waitFor(() => expect(screen.getByText("Expo Go 不支持 NFC 扫描，请使用 TestFlight 版，或直接打开礼品链接。")).toBeTruthy());
    expect(screen.queryByText("native module missing")).toBeNull();
  });
});
