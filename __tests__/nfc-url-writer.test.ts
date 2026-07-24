import {
  NfcUnavailableError,
  createNfcUrlWriter,
  type NativeNfcModule,
} from "../src/services/nfc/nfc-url-writer";

const giftUrl = "https://onetapreality.com/gift/test-token";

function createNativeModule(): NativeNfcModule & {
  start: jest.Mock;
  requestTechnology: jest.Mock;
  cancelTechnologyRequest: jest.Mock;
  writeNdefMessage: jest.Mock;
  getTag: jest.Mock;
  uriRecord: jest.Mock;
  encodeMessage: jest.Mock;
  decodePayload: jest.Mock;
} {
  const start = jest.fn().mockResolvedValue(true);
  const requestTechnology = jest.fn().mockResolvedValue(undefined);
  const cancelTechnologyRequest = jest.fn().mockResolvedValue(undefined);
  const writeNdefMessage = jest.fn().mockResolvedValue(undefined);
  const getTag = jest.fn().mockResolvedValue({ ndefMessage: [{ payload: [1, 2, 3] }] });
  const uriRecord = jest.fn().mockReturnValue([99]);
  const encodeMessage = jest.fn().mockReturnValue([7, 8, 9]);
  const decodePayload = jest.fn().mockReturnValue(giftUrl);
  const ndef = {
    uriRecord,
    encodeMessage,
    uri: { decodePayload },
  };

  return {
    start,
    requestTechnology,
    cancelTechnologyRequest,
    getTag,
    ndefHandler: { writeNdefMessage },
    ndef,
    nfcTech: { Ndef: "ndef" },
    writeNdefMessage,
    uriRecord,
    encodeMessage,
    decodePayload,
  };
}

describe("NFC URL writer", () => {
  it("loads native NFC only when writing and writes an HTTPS NDEF URI", async () => {
    const native = createNativeModule();
    const loadNativeModule = jest.fn().mockResolvedValue(native);
    const writer = createNfcUrlWriter({
      platform: "ios",
      isExpoGo: false,
      loadNativeModule,
    });

    expect(loadNativeModule).not.toHaveBeenCalled();

    await writer.writeHttpsUrl(giftUrl);

    expect(loadNativeModule).toHaveBeenCalledTimes(1);
    expect(native.start).toHaveBeenCalledTimes(1);
    expect(native.requestTechnology).toHaveBeenCalledWith("ndef");
    expect(native.uriRecord).toHaveBeenCalledWith(giftUrl);
    expect(native.encodeMessage).toHaveBeenCalledWith([[99]]);
    expect(native.writeNdefMessage).toHaveBeenCalledWith([7, 8, 9]);
    expect(native.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-HTTPS URL before touching NFC", async () => {
    const loadNativeModule = jest.fn();
    const writer = createNfcUrlWriter({
      platform: "android",
      isExpoGo: false,
      loadNativeModule,
    });

    await expect(writer.writeHttpsUrl("http://onetapreality.com/activate")).rejects.toThrow(
      "Only HTTPS URLs can be written to NFC tags.",
    );
    expect(loadNativeModule).not.toHaveBeenCalled();
  });

  it("verifies the exact HTTPS URL read back from the NFC tag", async () => {
    const native = createNativeModule();
    const writer = createNfcUrlWriter({
      platform: "android",
      isExpoGo: false,
      loadNativeModule: jest.fn().mockResolvedValue(native),
    });

    await expect(writer.verifyHttpsUrl(giftUrl)).resolves.toBe(true);
    expect(native.decodePayload).toHaveBeenCalledWith([1, 2, 3]);
    expect(native.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
  });

  it("reads the current HTTPS URI from a card before deciding whether it is safe to write", async () => {
    const native = createNativeModule();
    const writer = createNfcUrlWriter({
      platform: "android",
      isExpoGo: false,
      loadNativeModule: jest.fn().mockResolvedValue(native),
    });

    await expect(writer.readHttpsUrl()).resolves.toBe(giftUrl);
    expect(native.getTag).toHaveBeenCalledTimes(1);
    expect(native.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
  });

  it("does not load NFC in Expo Go and provides a clear native-build error", async () => {
    const loadNativeModule = jest.fn();
    const writer = createNfcUrlWriter({
      platform: "ios",
      isExpoGo: true,
      loadNativeModule,
    });

    await expect(writer.writeHttpsUrl(giftUrl)).rejects.toEqual(
      new NfcUnavailableError("NFC writing requires a Development Build or production app; Expo Go is not supported."),
    );
    expect(loadNativeModule).not.toHaveBeenCalled();
  });

  it("cancels the active native NFC request without loading a module on its own", async () => {
    const native = createNativeModule();
    const loadNativeModule = jest.fn().mockResolvedValue(native);
    const writer = createNfcUrlWriter({
      platform: "ios",
      isExpoGo: false,
      loadNativeModule,
    });

    await writer.cancel();
    expect(loadNativeModule).not.toHaveBeenCalled();

    await writer.writeHttpsUrl(giftUrl);
    await writer.cancel();
    expect(native.cancelTechnologyRequest).toHaveBeenCalledTimes(2);
  });
});
