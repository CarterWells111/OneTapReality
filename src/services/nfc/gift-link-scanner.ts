import Constants from "expo-constants";
import { Platform } from "react-native";

import { GiftLinkError, parseGiftLink, type ParsedGiftLink } from "./gift-link-parser";

export type GiftNdefRecord = {
  payload: number[];
  tnf: number;
  type: number[] | string;
};

export type GiftNdefReadAdapter = {
  cancelTechnologyRequest(): Promise<void>;
  decodeUriPayload(payload: number[]): string;
  isCancellation(error: unknown): boolean;
  isSupported(): Promise<boolean>;
  isUriRecord(record: GiftNdefRecord): boolean;
  readNdefRecords(): Promise<GiftNdefRecord[] | null>;
  requestNdefTechnology(): Promise<void>;
  start(): Promise<void>;
};

export type GiftLinkScannerErrorCode =
  | "NFC_BUSY"
  | "NFC_GIFT_LINK_INVALID"
  | "NFC_NATIVE_BUILD_REQUIRED"
  | "NFC_SCAN_CANCELLED"
  | "NFC_UNAVAILABLE";

export class GiftLinkScannerError extends Error {
  constructor(public readonly code: GiftLinkScannerErrorCode) {
    super("The NFC gift scan could not be completed.");
    this.name = "GiftLinkScannerError";
  }
}

export type GiftLinkScanner = {
  cancel(): Promise<void>;
  scan(): Promise<ParsedGiftLink>;
};

type ScannerPlatform = "android" | "ios" | "web";

type ScannerOptions = {
  expectedOrigin?: string;
  isExpoGo?: boolean;
  loadAdapter?: () => Promise<GiftNdefReadAdapter>;
  platform?: ScannerPlatform;
};

type ActiveScan = {
  adapter?: GiftNdefReadAdapter;
  cancelled: boolean;
  sequence: number;
  sessionRequested: boolean;
};

async function loadNativeReadAdapter(): Promise<GiftNdefReadAdapter> {
  // Loaded only when an iOS scan begins so web rendering never initializes Core NFC.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const imported = require("react-native-nfc-manager") as {
    default: {
      cancelTechnologyRequest(options?: { throwOnError?: boolean }): Promise<void>;
      isSupported(): Promise<boolean>;
      ndefHandler: { getNdefMessage(): Promise<{ ndefMessage?: GiftNdefRecord[] } | null> };
      requestTechnology(technology: string, options?: { alertMessage?: string }): Promise<unknown>;
      start(): Promise<void>;
    };
    Ndef: {
      RTD_URI: string;
      TNF_WELL_KNOWN: number;
      isType(record: GiftNdefRecord, tnf: number, type: string): boolean;
      uri: { decodePayload(payload: Uint8Array): string };
    };
    NfcError: {
      SessionInvalidated: new (...args: never[]) => Error;
      UserCancel: new (...args: never[]) => Error;
    };
    NfcTech: { Ndef: string };
  };
  const manager = imported.default;

  return {
    cancelTechnologyRequest: () => manager.cancelTechnologyRequest({ throwOnError: false }),
    decodeUriPayload: (payload) => imported.Ndef.uri.decodePayload(Uint8Array.from(payload)),
    isCancellation: (error) => (
      error instanceof imported.NfcError.UserCancel
      || error instanceof imported.NfcError.SessionInvalidated
    ),
    isSupported: () => manager.isSupported(),
    isUriRecord: (record) => imported.Ndef.isType(
      record,
      imported.Ndef.TNF_WELL_KNOWN,
      imported.Ndef.RTD_URI,
    ),
    readNdefRecords: async () => {
      const result = await manager.ndefHandler.getNdefMessage();
      return result?.ndefMessage ?? null;
    },
    requestNdefTechnology: async () => {
      await manager.requestTechnology(imported.NfcTech.Ndef, {
        alertMessage: "请将 OneTapReality 礼品卡靠近 iPhone 顶部。",
      });
    },
    start: () => manager.start(),
  };
}

export function createGiftLinkScanner(options: ScannerOptions = {}): GiftLinkScanner {
  const expectedOrigin = options.expectedOrigin ?? process.env.EXPO_PUBLIC_GIFT_ORIGIN ?? "";
  const isExpoGo = options.isExpoGo ?? (Platform.OS !== "web" && Constants.appOwnership === "expo");
  const loadAdapter = options.loadAdapter ?? loadNativeReadAdapter;
  const platform = options.platform ?? (Platform.OS as ScannerPlatform);
  let active: ActiveScan | null = null;
  let nextSequence = 0;

  const ensureActive = (operation: ActiveScan) => {
    if (operation.cancelled || active?.sequence !== operation.sequence) {
      throw new GiftLinkScannerError("NFC_SCAN_CANCELLED");
    }
  };

  return {
    async cancel() {
      const operation = active;
      if (!operation) return;
      operation.cancelled = true;
      if (operation.sessionRequested && operation.adapter) {
        await operation.adapter.cancelTechnologyRequest().catch(() => undefined);
      }
    },

    async scan() {
      if (active) throw new GiftLinkScannerError("NFC_BUSY");
      if (platform !== "ios") throw new GiftLinkScannerError("NFC_UNAVAILABLE");
      if (isExpoGo) throw new GiftLinkScannerError("NFC_NATIVE_BUILD_REQUIRED");

      const operation: ActiveScan = {
        cancelled: false,
        sequence: ++nextSequence,
        sessionRequested: false,
      };
      active = operation;

      try {
        const adapter = await loadAdapter();
        operation.adapter = adapter;
        ensureActive(operation);
        await adapter.start();
        ensureActive(operation);
        if (!await adapter.isSupported()) {
          throw new GiftLinkScannerError("NFC_UNAVAILABLE");
        }
        ensureActive(operation);

        operation.sessionRequested = true;
        await adapter.requestNdefTechnology();
        ensureActive(operation);
        const records = await adapter.readNdefRecords();
        ensureActive(operation);
        if (records?.length !== 1 || !adapter.isUriRecord(records[0])) {
          throw new GiftLinkScannerError("NFC_GIFT_LINK_INVALID");
        }

        const result = parseGiftLink(adapter.decodeUriPayload(records[0].payload), expectedOrigin);
        ensureActive(operation);
        return result;
      } catch (error) {
        if (operation.cancelled || operation.adapter?.isCancellation(error)) {
          throw new GiftLinkScannerError("NFC_SCAN_CANCELLED");
        }
        if (error instanceof GiftLinkScannerError) throw error;
        if (error instanceof GiftLinkError) {
          throw new GiftLinkScannerError("NFC_GIFT_LINK_INVALID");
        }
        throw new GiftLinkScannerError("NFC_UNAVAILABLE");
      } finally {
        if (operation.sessionRequested && operation.adapter) {
          await operation.adapter.cancelTechnologyRequest().catch(() => undefined);
        }
        if (active?.sequence === operation.sequence) active = null;
      }
    },
  };
}
