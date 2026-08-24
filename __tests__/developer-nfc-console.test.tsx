import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { DeveloperNfcConsole } from "../src/features/gifts/developer-nfc-console";
import {
  createInternalNfcUrlPolicy,
  type InternalNfcUrlPolicy,
} from "../src/services/nfc/internal-nfc-url-policy";
import type { NfcUrlWriter } from "../src/services/nfc/nfc-url-writer";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

jest.mock("../src/features/auth/auth-provider", () => ({ useAuth: jest.fn() }));

jest.mock("../src/services/gifts/gift-card-pending", () => ({
  loadPendingGiftCard: jest.fn(),
  savePendingGiftCard: jest.fn(),
  clearPendingGiftCard: jest.fn(),
}));

const { useAuth } = jest.requireMock("../src/features/auth/auth-provider") as { useAuth: jest.Mock };
const { loadPendingGiftCard, savePendingGiftCard, clearPendingGiftCard } = jest.requireMock("../src/services/gifts/gift-card-pending") as {
  loadPendingGiftCard: jest.Mock;
  savePendingGiftCard: jest.Mock;
  clearPendingGiftCard: jest.Mock;
};

const activeCard = {
  id: "card-1", code: "CARD-001", state: "active" as const, note: "July batch", giftId: "gift-1", giftStatus: "unclaimed",
  createdAt: "2026-07-24T00:00:00.000Z", activatedAt: "2026-07-24T00:01:00.000Z", retiredAt: null,
};
const initializingCard = {
  id: "card-2", code: "CARD-002", state: "initializing" as const, note: "New batch", giftId: "gift-2", giftStatus: "initializing",
  createdAt: "2026-07-24T00:02:00.000Z", activatedAt: null, retiredAt: null,
};

const TOKEN = "A".repeat(43);
const STAGING_GIFT_ORIGIN = "https://staging.onetapreality.com";
const PRODUCTION_GIFT_ORIGIN = "https://onetapreality.com";
const STAGING_GIFT_URL = `${STAGING_GIFT_ORIGIN}/gift/${TOKEN}`;
const PRODUCTION_GIFT_URL = `${PRODUCTION_GIFT_ORIGIN}/gift/${TOKEN}`;
const stagingPolicy = createInternalNfcUrlPolicy({
  apiOrigin: "https://api-staging.onetapreality.com",
  giftOrigin: STAGING_GIFT_ORIGIN,
});
const productionPolicy = createInternalNfcUrlPolicy({
  apiOrigin: "https://api.onetapreality.com",
  giftOrigin: PRODUCTION_GIFT_ORIGIN,
});

function createClient(giftUrl = STAGING_GIFT_URL) {
  return {
    listAdminGiftCards: jest.fn().mockResolvedValue([activeCard]),
    getAdminGiftCard: jest.fn().mockResolvedValue({ card: activeCard, events: [{ id: "event-1", kind: "activated", actorEmail: "dev@example.com", metadata: null, createdAt: activeCard.activatedAt }]}),
    reserveGiftCard: jest.fn().mockResolvedValue({ cardId: "card-2", cardCode: "CARD-002", giftUrl, expiresAt: "2026-07-24T00:15:00.000Z" }),
    activateAdminGiftCard: jest.fn().mockResolvedValue({ activated: true }),
    retireAdminGiftCard: jest.fn().mockResolvedValue({ retired: true }),
  };
}

function renderConsole(
  client = createClient(),
  writer = {} as NfcUrlWriter,
  urlPolicy: InternalNfcUrlPolicy = stagingPolicy,
) {
  return render(
    <DeveloperNfcConsole
      client={client as never}
      urlPolicy={urlPolicy}
      writer={writer}
    />,
  );
}

describe("developer NFC console", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ isAuthReady: true, session: { accessToken: "session", user: { id: "user-1", email: "dev@example.com", isAdmin: true } } });
    loadPendingGiftCard.mockResolvedValue(null);
  });

  it("lists active developer cards from the stored gift session", async () => {
    renderConsole();

    await waitFor(() => expect(screen.getByText("CARD-001")).toBeTruthy());
    expect(screen.getByText("July batch")).toBeTruthy();
  });

  it("blocks a second reservation until pending-card recovery finishes", async () => {
    let finishRecovery!: (value: null) => void;
    loadPendingGiftCard.mockReturnValue(new Promise<null>((resolve) => {
      finishRecovery = resolve;
    }));
    const client = createClient();
    renderConsole(client);

    await waitFor(() => expect(screen.getByText("CARD-001")).toBeTruthy());
    fireEvent.press(screen.getByText("Initialize current blank card"));
    expect(client.reserveGiftCard).not.toHaveBeenCalled();

    await act(async () => finishRecovery(null));
    fireEvent.press(screen.getByText("Initialize current blank card"));
    await waitFor(() => expect(client.reserveGiftCard).toHaveBeenCalledTimes(1));
  });

  it("writes, verifies, and only then activates a reserved unique gift card", async () => {
    const client = createClient();
    const writer = {
      replaceHttpsUrl: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue(undefined),
    } as unknown as NfcUrlWriter;
    renderConsole(client, writer);

    await waitFor(() => expect(screen.getByText("CARD-001")).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText("Card note"), "New batch");
    fireEvent.press(screen.getByText("Initialize current blank card"));

    await waitFor(() => expect(writer.replaceHttpsUrl).toHaveBeenCalledWith(
      `${STAGING_GIFT_ORIGIN}/activate`,
      STAGING_GIFT_URL,
    ));
    expect(client.activateAdminGiftCard).toHaveBeenCalledWith("session", "card-2");
  });

  it("shows an initializing reservation and retry action when the single NFC session fails", async () => {
    const client = createClient();
    client.listAdminGiftCards
      .mockResolvedValueOnce([activeCard])
      .mockResolvedValue([activeCard, initializingCard]);
    const writer = {
      replaceHttpsUrl: jest.fn().mockRejectedValue(new Error("Tag is not writable")),
      cancel: jest.fn().mockResolvedValue(undefined),
    } as unknown as NfcUrlWriter;
    renderConsole(client, writer);

    await waitFor(() => expect(screen.getByText("CARD-001")).toBeTruthy());
    fireEvent.press(screen.getByText("Initialize current blank card"));

    await waitFor(() => expect(screen.getByText("CARD-002")).toBeTruthy());
    expect(screen.getByText("Retry NFC write")).toBeTruthy();
    expect(client.activateAdminGiftCard).not.toHaveBeenCalled();
  });

  it("refuses to initialize a card that is not the shared activation URL", async () => {
    const client = createClient();
    const writer = {
      replaceHttpsUrl: jest.fn().mockRejectedValue(new Error("This card does not contain the expected activation URL. It was not changed.")),
      cancel: jest.fn(),
    } as unknown as NfcUrlWriter;
    renderConsole(client, writer);

    await waitFor(() => expect(screen.getByText("CARD-001")).toBeTruthy());
    fireEvent.press(screen.getByText("Initialize current blank card"));

    await waitFor(() => expect(screen.getByText(/does not contain the expected activation URL/)).toBeTruthy());
    expect(client.reserveGiftCard).toHaveBeenCalledTimes(1);
    expect(writer.replaceHttpsUrl).toHaveBeenCalledWith(
      `${STAGING_GIFT_ORIGIN}/activate`,
      STAGING_GIFT_URL,
    );
  });

  it("refuses to prepare a card that already has a URL", async () => {
    const client = createClient();
    const writer = {
      replaceHttpsUrl: jest.fn().mockRejectedValue(new Error("This card already contains a URL and was not changed.")),
      cancel: jest.fn(),
    } as unknown as NfcUrlWriter;
    renderConsole(client, writer);

    await waitFor(() => expect(screen.getByText("CARD-001")).toBeTruthy());
    fireEvent.press(screen.getByText("Prepare blank card"));

    await waitFor(() => expect(screen.getByText("This card already contains a URL and was not changed.")).toBeTruthy());
    expect(writer.replaceHttpsUrl).toHaveBeenCalledWith(
      null,
      `${STAGING_GIFT_ORIGIN}/activate`,
    );
  });

  it("keeps the exact reservation and retries activation without creating or writing another card", async () => {
    const client = createClient();
    client.activateAdminGiftCard.mockRejectedValueOnce(new Error("Network unavailable")).mockResolvedValueOnce({ activated: true });
    const writer = {
      replaceHttpsUrl: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn(),
    } as unknown as NfcUrlWriter;
    renderConsole(client, writer);

    await waitFor(() => expect(screen.getByText("CARD-001")).toBeTruthy());
    fireEvent.press(screen.getByText("Initialize current blank card"));
    await waitFor(() => expect(savePendingGiftCard).toHaveBeenCalledWith(expect.objectContaining({ cardId: "card-2" })));
    await waitFor(() => expect(screen.getByText("Retry activation" )).toBeTruthy());
    fireEvent.press(screen.getByText("Retry activation"));

    await waitFor(() => expect(client.activateAdminGiftCard).toHaveBeenCalledTimes(2));
    expect(client.reserveGiftCard).toHaveBeenCalledTimes(1);
    expect(writer.replaceHttpsUrl).toHaveBeenCalledTimes(1);
    expect(clearPendingGiftCard).toHaveBeenCalledTimes(1);
  });

  it("uses the production activation and gift pair only with the production policy", async () => {
    const client = createClient(PRODUCTION_GIFT_URL);
    const writer = {
      replaceHttpsUrl: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn(),
    } as unknown as NfcUrlWriter;
    renderConsole(client, writer, productionPolicy);

    await waitFor(() => expect(screen.getByText("CARD-001")).toBeTruthy());
    fireEvent.press(screen.getByText("Initialize current blank card"));

    await waitFor(() => expect(writer.replaceHttpsUrl).toHaveBeenCalledWith(
      `${PRODUCTION_GIFT_ORIGIN}/activate`,
      PRODUCTION_GIFT_URL,
    ));
  });

  it("rejects a cross-environment reservation before local save or NFC write", async () => {
    const client = createClient(PRODUCTION_GIFT_URL);
    const writer = {
      replaceHttpsUrl: jest.fn(),
      cancel: jest.fn(),
    } as unknown as NfcUrlWriter;
    renderConsole(client, writer);

    await waitFor(() => expect(screen.getByText("CARD-001")).toBeTruthy());
    fireEvent.press(screen.getByText("Initialize current blank card"));

    await waitFor(() => expect(screen.getByText(
      /NFC link belongs to a different environment/u,
    )).toBeTruthy());
    expect(savePendingGiftCard).not.toHaveBeenCalled();
    expect(writer.replaceHttpsUrl).not.toHaveBeenCalled();
    expect(client.activateAdminGiftCard).not.toHaveBeenCalled();
    expect(screen.queryByText(new RegExp(TOKEN, "u"))).toBeNull();
    expect(screen.queryByText(PRODUCTION_GIFT_URL)).toBeNull();
  });

  it("clears a recovered cross-environment reservation without any NFC write", async () => {
    loadPendingGiftCard.mockResolvedValue({
      cardId: "card-2",
      cardCode: "CARD-002",
      giftUrl: PRODUCTION_GIFT_URL,
      expiresAt: "2026-07-24T00:15:00.000Z",
    });
    const client = createClient();
    const writer = {
      replaceHttpsUrl: jest.fn(),
      cancel: jest.fn(),
    } as unknown as NfcUrlWriter;
    renderConsole(client, writer);

    await waitFor(() => expect(clearPendingGiftCard).toHaveBeenCalledTimes(1));
    expect(client.getAdminGiftCard).not.toHaveBeenCalled();
    expect(writer.replaceHttpsUrl).not.toHaveBeenCalled();
    expect(screen.queryByText("Retry NFC write")).toBeNull();
    expect(screen.queryByText(new RegExp(TOKEN, "u"))).toBeNull();
  });

  it("contains no hardcoded production activation URL", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/gifts/developer-nfc-console.tsx"),
      "utf8",
    );

    expect(source).not.toContain("https://onetapreality.com/activate");
    expect(source).not.toMatch(/const\s+activationUrl/u);
    expect(source).toContain("process.env.EXPO_PUBLIC_API_ORIGIN");
    expect(source).toContain("process.env.EXPO_PUBLIC_GIFT_ORIGIN");
  });
});
