import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { DeveloperNfcConsole } from "../src/features/gifts/developer-nfc-console";
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

function createClient() {
  return {
    listAdminGiftCards: jest.fn().mockResolvedValue([activeCard]),
    getAdminGiftCard: jest.fn().mockResolvedValue({ card: activeCard, events: [{ id: "event-1", kind: "activated", actorEmail: "dev@example.com", metadata: null, createdAt: activeCard.activatedAt }]}),
    reserveGiftCard: jest.fn().mockResolvedValue({ cardId: "card-2", cardCode: "CARD-002", giftUrl: "https://onetapreality.com/gift/unique-token", expiresAt: "2026-07-24T00:15:00.000Z" }),
    activateAdminGiftCard: jest.fn().mockResolvedValue({ activated: true }),
    retireAdminGiftCard: jest.fn().mockResolvedValue({ retired: true }),
  };
}

describe("developer NFC console", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ isAuthReady: true, session: { accessToken: "session", user: { id: "user-1", email: "dev@example.com", isAdmin: true } } });
    loadPendingGiftCard.mockResolvedValue(null);
  });

  it("lists active developer cards from the stored gift session", async () => {
    render(<DeveloperNfcConsole client={createClient() as never} writer={{} as NfcUrlWriter} />);

    await waitFor(() => expect(screen.getByText("CARD-001")).toBeTruthy());
    expect(screen.getByText("July batch")).toBeTruthy();
  });

  it("writes, verifies, and only then activates a reserved unique gift card", async () => {
    const client = createClient();
    const writer = {
      replaceHttpsUrl: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue(undefined),
    } as unknown as NfcUrlWriter;
    render(<DeveloperNfcConsole client={client as never} writer={writer} />);

    await waitFor(() => expect(screen.getByText("CARD-001")).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText("Card note"), "New batch");
    fireEvent.press(screen.getByText("Initialize current blank card"));

    await waitFor(() => expect(writer.replaceHttpsUrl).toHaveBeenCalledWith(
      "https://onetapreality.com/activate",
      "https://onetapreality.com/gift/unique-token",
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
    render(<DeveloperNfcConsole client={client as never} writer={writer} />);

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
    render(<DeveloperNfcConsole client={client as never} writer={writer} />);

    await waitFor(() => expect(screen.getByText("CARD-001")).toBeTruthy());
    fireEvent.press(screen.getByText("Initialize current blank card"));

    await waitFor(() => expect(screen.getByText(/does not contain the expected activation URL/)).toBeTruthy());
    expect(client.reserveGiftCard).toHaveBeenCalledTimes(1);
    expect(writer.replaceHttpsUrl).toHaveBeenCalledWith(
      "https://onetapreality.com/activate",
      "https://onetapreality.com/gift/unique-token",
    );
  });

  it("refuses to prepare a card that already has a URL", async () => {
    const client = createClient();
    const writer = {
      replaceHttpsUrl: jest.fn().mockRejectedValue(new Error("This card already contains a URL and was not changed.")),
      cancel: jest.fn(),
    } as unknown as NfcUrlWriter;
    render(<DeveloperNfcConsole client={client as never} writer={writer} />);

    await waitFor(() => expect(screen.getByText("CARD-001")).toBeTruthy());
    fireEvent.press(screen.getByText("Prepare blank card"));

    await waitFor(() => expect(screen.getByText("This card already contains a URL and was not changed.")).toBeTruthy());
    expect(writer.replaceHttpsUrl).toHaveBeenCalledWith(null, "https://onetapreality.com/activate");
  });

  it("keeps the exact reservation and retries activation without creating or writing another card", async () => {
    const client = createClient();
    client.activateAdminGiftCard.mockRejectedValueOnce(new Error("Network unavailable")).mockResolvedValueOnce({ activated: true });
    const writer = {
      replaceHttpsUrl: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn(),
    } as unknown as NfcUrlWriter;
    render(<DeveloperNfcConsole client={client as never} writer={writer} />);

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
});
