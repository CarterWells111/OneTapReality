import Constants from "expo-constants";
import { Platform } from "react-native";

export type NfcPlatform = "ios" | "android" | "web";

export interface NativeNfcModule {
  start(): Promise<boolean>;
  requestTechnology(technology: unknown): Promise<void>;
  cancelTechnologyRequest(): Promise<void>;
  getTag(): Promise<{ ndefMessage?: { payload?: number[] }[] } | null>;
  ndefHandler: {
    getNdefMessage(): Promise<{ ndefMessage?: { payload?: number[] }[] } | null>;
    writeNdefMessage(message: unknown[]): Promise<void>;
  };
  ndef: {
    uriRecord(url: string): unknown;
    encodeMessage(records: unknown[]): number[];
    uri: {
      decodePayload(payload: number[]): string;
    };
  };
  nfcTech: {
    Ndef: unknown;
  };
}

export interface NfcUrlWriter {
  replaceHttpsUrl(expectedUrl: string | null, url: string): Promise<void>;
  writeHttpsUrl(url: string): Promise<void>;
  verifyHttpsUrl(url: string): Promise<boolean>;
  readHttpsUrl(): Promise<string | null>;
  cancel(): Promise<void>;
}

export class NfcUnavailableError extends Error {
  readonly code = "NFC_UNAVAILABLE";

  constructor(message: string) {
    super(message);
    this.name = "NfcUnavailableError";
  }
}

export interface NfcUrlWriterOptions {
  platform?: NfcPlatform;
  isExpoGo?: boolean;
  loadNativeModule?: () => Promise<NativeNfcModule>;
}

function isHttpsUrl(url: string) {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function defaultNativeModuleLoader(): Promise<NativeNfcModule> {
  // This require runs only after a native-only operation starts. It keeps Jest and
  // the web bundle from loading react-native-nfc-manager at module initialization.
  // The package is added by the production native-build integration.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const imported = require("react-native-nfc-manager") as {
    default?: Omit<NativeNfcModule, "ndef" | "nfcTech">;
    Ndef: NativeNfcModule["ndef"];
    NfcTech: NativeNfcModule["nfcTech"];
  };
  const manager = imported.default ?? imported;

  return Promise.resolve(Object.assign(manager, {
    ndef: imported.Ndef,
    nfcTech: imported.NfcTech,
  }) as NativeNfcModule);
}

export class NfcTagMismatchError extends Error {
  readonly code = "NFC_TAG_MISMATCH";

  constructor(expectedUrl: string | null, currentUrl: string | null, containsProtectedData = false) {
    const message = containsProtectedData
      ? "This card already contains OneTapReality data and was not changed."
      : expectedUrl
      ? "This card does not contain the expected activation URL. It was not changed."
      : currentUrl
        ? "This card already contains a URL and was not changed."
        : "This card contains unsupported NFC data and was not changed.";
    super(message);
    this.name = "NfcTagMismatchError";
  }
}

export class NfcVerificationError extends Error {
  readonly code = "NFC_VERIFY_FAILED";

  constructor() {
    super("The NFC write could not be verified. Keep the card near the phone and retry.");
    this.name = "NfcVerificationError";
  }
}

function defaultIsExpoGo() {
  return Platform.OS !== "web" && Constants.appOwnership === "expo";
}

function inspectNdefRecords(
  native: NativeNfcModule,
  records: { payload?: number[] }[] | undefined,
): { httpsUrl: string | null; containsOneTapRealityData: boolean } {
  let httpsUrl: string | null = null;
  let containsOneTapRealityData = false;
  for (const record of records ?? []) {
    if (!record.payload) continue;
    try {
      const url = native.ndef.uri.decodePayload(record.payload);
      if (typeof url === "string") {
        if (httpsUrl === null && isHttpsUrl(url)) httpsUrl = url;
        if (url.toLowerCase().includes("onetapreality")) containsOneTapRealityData = true;
      }
    } catch {
      // Non-URI NDEF records are not eligible gift-card URLs.
    }
    if (String.fromCharCode(...record.payload).toLowerCase().includes("onetapreality")) {
      containsOneTapRealityData = true;
    }
  }
  return { httpsUrl, containsOneTapRealityData };
}

function decodeHttpsUrl(
  native: NativeNfcModule,
  records: { payload?: number[] }[] | undefined,
): string | null {
  return inspectNdefRecords(native, records).httpsUrl;
}

class NativeNfcUrlWriter implements NfcUrlWriter {
  private nativeModule: NativeNfcModule | undefined;

  constructor(private readonly options: Required<NfcUrlWriterOptions>) {}

  async replaceHttpsUrl(expectedUrl: string | null, url: string) {
    if (expectedUrl !== null) this.assertHttpsUrl(expectedUrl);
    this.assertHttpsUrl(url);
    const native = await this.getNativeModule();
    await native.start();
    await native.requestTechnology(native.nfcTech.Ndef);

    try {
      const tag = await native.getTag();
      const inspection = inspectNdefRecords(native, tag?.ndefMessage);
      const currentUrl = inspection.httpsUrl;

      if (currentUrl === url) return;
      if (expectedUrl === null && inspection.containsOneTapRealityData) {
        throw new NfcTagMismatchError(expectedUrl, currentUrl, true);
      }
      if (expectedUrl !== null && currentUrl !== expectedUrl) {
        throw new NfcTagMismatchError(expectedUrl, currentUrl);
      }

      await native.ndefHandler.writeNdefMessage(
        native.ndef.encodeMessage([native.ndef.uriRecord(url)]),
      );
      const updatedTag = await native.ndefHandler.getNdefMessage();
      if (decodeHttpsUrl(native, updatedTag?.ndefMessage) !== url) {
        throw new NfcVerificationError();
      }
    } finally {
      await native.cancelTechnologyRequest();
    }
  }

  async writeHttpsUrl(url: string) {
    this.assertHttpsUrl(url);
    const native = await this.getNativeModule();
    await native.start();
    await native.requestTechnology(native.nfcTech.Ndef);

    try {
      await native.ndefHandler.writeNdefMessage(
        native.ndef.encodeMessage([native.ndef.uriRecord(url)]),
      );
    } finally {
      await native.cancelTechnologyRequest();
    }
  }

  async verifyHttpsUrl(url: string) {
    this.assertHttpsUrl(url);
    const native = await this.getNativeModule();
    await native.start();
    await native.requestTechnology(native.nfcTech.Ndef);

    try {
      const tag = await native.getTag();
      return (
        tag?.ndefMessage?.some((record) => {
          if (!record.payload) {
            return false;
          }

          try {
            return native.ndef.uri.decodePayload(record.payload) === url;
          } catch {
            return false;
          }
        }) ?? false
      );
    } finally {
      await native.cancelTechnologyRequest();
    }
  }

  async readHttpsUrl(): Promise<string | null> {
    const native = await this.getNativeModule();
    await native.start();
    await native.requestTechnology(native.nfcTech.Ndef);

    try {
      const tag = await native.getTag();
      for (const record of tag?.ndefMessage ?? []) {
        if (!record.payload) continue;
        try {
          const url = native.ndef.uri.decodePayload(record.payload);
          if (isHttpsUrl(url)) return url;
        } catch {
          // A non-URI NDEF record is not an eligible URL and is left untouched.
        }
      }
      return null;
    } finally {
      await native.cancelTechnologyRequest();
    }
  }

  async cancel() {
    await this.nativeModule?.cancelTechnologyRequest();
  }

  private assertHttpsUrl(url: string) {
    if (!isHttpsUrl(url)) {
      throw new Error("Only HTTPS URLs can be written to NFC tags.");
    }
  }

  private async getNativeModule() {
    if (this.options.platform === "web") {
      throw new NfcUnavailableError("NFC writing is only available in the iOS or Android app.");
    }

    if (this.options.isExpoGo) {
      throw new NfcUnavailableError(
        "NFC writing requires a Development Build or production app; Expo Go is not supported.",
      );
    }

    this.nativeModule ??= await this.options.loadNativeModule();
    return this.nativeModule;
  }
}

export function createNfcUrlWriter(options: NfcUrlWriterOptions = {}): NfcUrlWriter {
  return new NativeNfcUrlWriter({
    platform: options.platform ?? (Platform.OS as NfcPlatform),
    isExpoGo: options.isExpoGo ?? defaultIsExpoGo(),
    loadNativeModule: options.loadNativeModule ?? defaultNativeModuleLoader,
  });
}
