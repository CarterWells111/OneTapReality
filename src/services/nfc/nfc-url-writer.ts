import Constants from "expo-constants";
import { Platform } from "react-native";

export type NfcPlatform = "ios" | "android" | "web";

export interface NativeNfcModule {
  start(): Promise<boolean>;
  requestTechnology(technology: unknown): Promise<void>;
  cancelTechnologyRequest(): Promise<void>;
  getTag(): Promise<{ ndefMessage?: { payload?: number[] }[] } | null>;
  ndefHandler: {
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

  return Promise.resolve({
    ...manager,
    ndef: imported.Ndef,
    nfcTech: imported.NfcTech,
  } as NativeNfcModule);
}

function defaultIsExpoGo() {
  return Platform.OS !== "web" && Constants.appOwnership === "expo";
}

class NativeNfcUrlWriter implements NfcUrlWriter {
  private nativeModule: NativeNfcModule | undefined;

  constructor(private readonly options: Required<NfcUrlWriterOptions>) {}

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
