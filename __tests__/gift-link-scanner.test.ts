import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createGiftLinkScanner,
  type GiftNdefReadAdapter,
} from "../src/services/nfc/gift-link-scanner";

const ORIGIN = "https://staging.onetapreality.com";
const TOKEN = "Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE";

function makeAdapter(url = `${ORIGIN}/gift/${TOKEN}`): GiftNdefReadAdapter {
  return {
    cancelTechnologyRequest: jest.fn(async () => undefined),
    decodeUriPayload: jest.fn(() => url),
    isCancellation: jest.fn(() => false),
    isSupported: jest.fn(async () => true),
    isUriRecord: jest.fn(() => true),
    readNdefRecords: jest.fn(async () => [{ tnf: 1, type: [0x55], payload: [0x04] }]),
    requestNdefTechnology: jest.fn(async () => undefined),
    start: jest.fn(async () => undefined),
  };
}

describe("read-only gift NFC scanner", () => {
  it("reads one NDEF URI and hands off the canonical gift route", async () => {
    const adapter = makeAdapter();
    const scanner = createGiftLinkScanner({
      expectedOrigin: ORIGIN,
      loadAdapter: async () => adapter,
      platform: "ios",
    });

    await expect(scanner.scan()).resolves.toEqual({
      pathname: `/gift/${TOKEN}`,
      token: TOKEN,
    });
    expect(adapter.requestNdefTechnology).toHaveBeenCalledTimes(1);
    expect(adapter.readNdefRecords).toHaveBeenCalledTimes(1);
    expect(adapter.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
  });

  it("rejects non-URI and multi-record NDEF payloads without decoding them", async () => {
    const adapter = makeAdapter();
    jest.mocked(adapter.isUriRecord).mockReturnValue(false);
    jest.mocked(adapter.readNdefRecords).mockResolvedValue([
      { tnf: 1, type: [0x54], payload: [0x02] },
    ]);
    const scanner = createGiftLinkScanner({ expectedOrigin: ORIGIN, loadAdapter: async () => adapter, platform: "ios" });

    await expect(scanner.scan()).rejects.toMatchObject({ code: "NFC_GIFT_LINK_INVALID" });
    expect(adapter.decodeUriPayload).not.toHaveBeenCalled();

    jest.mocked(adapter.isUriRecord).mockReturnValue(true);
    jest.mocked(adapter.readNdefRecords).mockResolvedValue([
      { tnf: 1, type: [0x55], payload: [0x04] },
      { tnf: 1, type: [0x55], payload: [0x04] },
    ]);
    await expect(scanner.scan()).rejects.toMatchObject({ code: "NFC_GIFT_LINK_INVALID" });
  });

  it("cancels the active native session and ignores a late tag result", async () => {
    const adapter = makeAdapter();
    let resolveRead: ((records: Array<{ tnf: number; type: number[]; payload: number[] }>) => void) | undefined;
    jest.mocked(adapter.readNdefRecords).mockReturnValue(new Promise((resolve) => { resolveRead = resolve; }));
    const scanner = createGiftLinkScanner({ expectedOrigin: ORIGIN, loadAdapter: async () => adapter, platform: "ios" });

    const pending = scanner.scan();
    for (let attempt = 0; attempt < 10 && !jest.mocked(adapter.readNdefRecords).mock.calls.length; attempt += 1) {
      await Promise.resolve();
    }
    expect(adapter.readNdefRecords).toHaveBeenCalledTimes(1);
    await scanner.cancel();
    resolveRead?.([{ tnf: 1, type: [0x55], payload: [0x04] }]);

    await expect(pending).rejects.toMatchObject({ code: "NFC_SCAN_CANCELLED" });
    expect(adapter.cancelTechnologyRequest).toHaveBeenCalled();
  });

  it.each([
    class UserCancel extends Error {},
    class SessionInvalidated extends Error {},
  ])("maps a native %s subclass with Error.name to cancellation", async (NativeCancellation) => {
    const nativeError = new NativeCancellation();
    expect(nativeError.name).toBe("Error");
    expect(nativeError.constructor.name).toBe(NativeCancellation.name);
    const isCancellation = jest.fn((error: unknown) => error instanceof NativeCancellation);
    const adapter = Object.assign(makeAdapter(), { isCancellation });
    jest.mocked(adapter.requestNdefTechnology).mockRejectedValue(nativeError);
    const scanner = createGiftLinkScanner({
      expectedOrigin: ORIGIN,
      loadAdapter: async () => adapter,
      platform: "ios",
    });

    await expect(scanner.scan()).rejects.toMatchObject({ code: "NFC_SCAN_CANCELLED" });
    expect(isCancellation).toHaveBeenCalledWith(nativeError);
  });

  it("does not swallow a non-cancellation native error", async () => {
    class Timeout extends Error {}
    const nativeError = new Timeout();
    const isCancellation = jest.fn(() => false);
    const adapter = Object.assign(makeAdapter(), { isCancellation });
    jest.mocked(adapter.requestNdefTechnology).mockRejectedValue(nativeError);
    const scanner = createGiftLinkScanner({
      expectedOrigin: ORIGIN,
      loadAdapter: async () => adapter,
      platform: "ios",
    });

    await expect(scanner.scan()).rejects.toMatchObject({ code: "NFC_UNAVAILABLE" });
    expect(isCancellation).toHaveBeenCalledWith(nativeError);
  });

  it("fails closed off iOS and never loads the native module", async () => {
    const loadAdapter = jest.fn(async () => makeAdapter());
    const scanner = createGiftLinkScanner({ expectedOrigin: ORIGIN, loadAdapter, platform: "web" });

    await expect(scanner.scan()).rejects.toMatchObject({ code: "NFC_UNAVAILABLE" });
    expect(loadAdapter).not.toHaveBeenCalled();
  });

  it("contains no NFC write, UID access, persistence, or token logging surface", () => {
    const source = readFileSync(
      join(process.cwd(), "src/services/nfc/gift-link-scanner.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/writeNdef|uriRecord|makeReadOnly|\.id\b|AsyncStorage|SecureStore/u);
    expect(source).not.toMatch(/console\.(?:log|info|warn|error|debug)/u);
    expect(source).not.toMatch(/developer-nfc-console|nfc-url-writer|admin-gift/u);
    expect(source).toMatch(/instanceof imported\.NfcError\.(?:UserCancel|SessionInvalidated)/u);
  });
});
