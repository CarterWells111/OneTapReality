import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { DeveloperNfcConsole } from "../src/features/gifts/developer-nfc-console";
import { BackendApiError } from "../src/services/backend/api-client";
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
  markPendingGiftCardWriteVerified: jest.fn(),
}));

const { useAuth } = jest.requireMock("../src/features/auth/auth-provider") as { useAuth: jest.Mock };
const {
  loadPendingGiftCard,
  savePendingGiftCard,
  clearPendingGiftCard,
  markPendingGiftCardWriteVerified,
} = jest.requireMock("../src/services/gifts/gift-card-pending") as {
  loadPendingGiftCard: jest.Mock;
  savePendingGiftCard: jest.Mock;
  clearPendingGiftCard: jest.Mock;
  markPendingGiftCardWriteVerified: jest.Mock;
};

const activeCard = {
  id: "card-1", code: "CARD-001", state: "active" as const, note: "July batch", giftId: "gift-1", giftStatus: "unclaimed",
  createdAt: "2026-07-24T00:00:00.000Z", activatedAt: "2026-07-24T00:01:00.000Z", retiredAt: null,
};
const initializingCard = {
  id: "card-2", code: "CARD-002", state: "initializing" as const, note: "New batch", giftId: "gift-2", giftStatus: "initializing",
  createdAt: "2026-07-24T00:02:00.000Z", expiresAt: "2026-07-24T00:15:00.000Z", activatedAt: null, retiredAt: null,
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

type TestAuthState = {
  isAuthReady: boolean;
  session: {
    accessToken: string;
    user: { id: string; email: string; isAdmin: boolean };
  } | null;
};

const oldSession = {
  accessToken: "old-access-token",
  user: { id: "user-1", email: "Dev@Example.com", isAdmin: true },
};
const refreshedNonAdminSession = {
  accessToken: "refreshed-access-token",
  user: { id: "user-1", email: "dev@example.com", isAdmin: false },
};
const refreshedAdminSession = {
  accessToken: "refreshed-admin-access-token",
  user: { id: "user-1", email: "dev@example.com", isAdmin: true },
};
const newAdminSession = {
  accessToken: "new-access-token",
  user: { id: "user-2", email: "new-dev@example.com", isAdmin: true },
};
let currentAuth: TestAuthState;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

type TestTreeNode = {
  readonly parent: TestTreeNode | null;
  readonly props: Record<string, unknown>;
};

function closestPressable(node: unknown): TestTreeNode {
  let current = node as TestTreeNode | null;
  while (current && typeof current.props.onPress !== "function") {
    current = current.parent;
  }
  if (!current) throw new Error("Expected a pressable ancestor");
  return current;
}

function pendingReservation(ownerUserId = "user-1") {
  return {
    ownerUserId,
    operationId: "card-2",
    revision: 1,
    cardId: "card-2",
    cardCode: "CARD-002",
    giftUrl: STAGING_GIFT_URL,
    expiresAt: "2026-07-24T00:15:00.000Z",
  };
}

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

function consoleElement(
  client = createClient(),
  writer = {} as NfcUrlWriter,
  urlPolicy: InternalNfcUrlPolicy = stagingPolicy,
) {
  return (
    <DeveloperNfcConsole
      client={client as never}
      urlPolicy={urlPolicy}
      writer={writer}
    />
  );
}

describe("developer NFC console", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentAuth = {
      isAuthReady: true,
      session: {
        accessToken: "session",
        user: { id: "user-1", email: "dev@example.com", isAdmin: true },
      },
    };
    useAuth.mockImplementation(() => currentAuth);
    loadPendingGiftCard.mockReset().mockResolvedValue(null);
    savePendingGiftCard.mockReset().mockResolvedValue(true);
    clearPendingGiftCard.mockReset().mockResolvedValue(true);
    markPendingGiftCardWriteVerified.mockReset().mockImplementation(
      async (ownerUserId: string, operationId: string) => ({
        ...pendingReservation(ownerUserId),
        operationId,
        cardId: operationId,
        revision: 2,
        writeVerified: true,
      }),
    );
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

  it("ignores an old admin inventory response after the same user receives a new token without access", async () => {
    const oldInventory = deferred<(typeof activeCard)[]>();
    const client = createClient();
    client.listAdminGiftCards
      .mockReset()
      .mockReturnValueOnce(oldInventory.promise)
      .mockRejectedValueOnce(new BackendApiError(403, "forbidden", "old secret"));
    currentAuth = { isAuthReady: true, session: oldSession };
    const view = renderConsole(client);

    await waitFor(() => expect(client.listAdminGiftCards).toHaveBeenCalledWith(
      oldSession.accessToken,
      undefined,
    ));
    currentAuth = { isAuthReady: true, session: refreshedNonAdminSession };
    view.rerender(consoleElement(client));
    await waitFor(() => expect(screen.getByText(
      "This email does not have developer NFC access.",
    )).toBeTruthy());

    await act(async () => oldInventory.resolve([activeCard]));
    expect(screen.queryByText("CARD-001")).toBeNull();
    expect(screen.getByText("This email does not have developer NFC access.")).toBeTruthy();
    expect(screen.queryByText(/access-token|old secret/u)).toBeNull();
  });

  it("does not restore an old account pending reservation after switching accounts", async () => {
    const oldRecovery = deferred<ReturnType<typeof pendingReservation>>();
    loadPendingGiftCard
      .mockReset()
      .mockReturnValueOnce(oldRecovery.promise)
      .mockResolvedValueOnce(null);
    const client = createClient();
    client.getAdminGiftCard.mockResolvedValue({ card: initializingCard, events: [] });
    currentAuth = { isAuthReady: true, session: oldSession };
    const view = renderConsole(client);

    await waitFor(() => expect(loadPendingGiftCard).toHaveBeenCalledTimes(1));
    currentAuth = { isAuthReady: true, session: newAdminSession };
    view.rerender(consoleElement(client));
    await waitFor(() => expect(loadPendingGiftCard).toHaveBeenCalledTimes(2));

    await act(async () => oldRecovery.resolve(pendingReservation("user-1")));
    expect(client.getAdminGiftCard).not.toHaveBeenCalledWith(
      oldSession.accessToken,
      "card-2",
    );
    expect(screen.queryByText("Retry NFC write")).toBeNull();
  });

  it.each([
    [401, "session_expired"],
    [403, "forbidden"],
  ])("revokes recovery actions after a %i authorization failure", async (status, code) => {
    loadPendingGiftCard.mockResolvedValue(pendingReservation("user-1"));
    const client = createClient();
    client.getAdminGiftCard.mockRejectedValue(
      new BackendApiError(status, code, `raw authorization error ${TOKEN}`),
    );
    const writer = {
      replaceHttpsUrl: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue(undefined),
    } as unknown as NfcUrlWriter;
    renderConsole(client, writer);

    await waitFor(() => expect(client.getAdminGiftCard).toHaveBeenCalledTimes(1));
    const capturedNfcRetry = screen.queryByText("Retry NFC write");
    if (capturedNfcRetry) {
      fireEvent.press(capturedNfcRetry);
      await act(async () => Promise.resolve());
    }

    expect(screen.getByText("This email does not have developer NFC access.")).toBeTruthy();
    expect(screen.queryByText("Retry NFC write")).toBeNull();
    expect(writer.replaceHttpsUrl).not.toHaveBeenCalled();
    expect(client.reserveGiftCard).not.toHaveBeenCalled();
    expect(client.activateAdminGiftCard).not.toHaveBeenCalled();
    expect(clearPendingGiftCard).not.toHaveBeenCalled();
    expect(screen.queryByText(new RegExp(TOKEN, "u"))).toBeNull();
    expect(screen.queryByText(/raw authorization error/u)).toBeNull();
  });

  it.each([
    [404, "not_found"],
    [400, "reservation_not_found"],
  ])("conditionally clears a missing recovered reservation (%i/%s)", async (status, code) => {
    loadPendingGiftCard.mockResolvedValue(pendingReservation("user-1"));
    const client = createClient();
    client.getAdminGiftCard.mockRejectedValue(
      new BackendApiError(status, code, `raw missing reservation ${TOKEN}`),
    );
    const writer = {
      replaceHttpsUrl: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue(undefined),
    } as unknown as NfcUrlWriter;
    renderConsole(client, writer);

    await waitFor(() => expect(clearPendingGiftCard).toHaveBeenCalledWith(
      "user-1",
      "card-2",
    ));
    const capturedNfcRetry = screen.queryByText("Retry NFC write");
    if (capturedNfcRetry) {
      fireEvent.press(capturedNfcRetry);
      await act(async () => Promise.resolve());
    }

    expect(screen.queryByText("Retry NFC write")).toBeNull();
    expect(writer.replaceHttpsUrl).not.toHaveBeenCalled();
    expect(client.reserveGiftCard).not.toHaveBeenCalled();
    expect(client.activateAdminGiftCard).not.toHaveBeenCalled();
    expect(screen.queryByText(new RegExp(TOKEN, "u"))).toBeNull();
    expect(screen.queryByText(/raw missing reservation/u)).toBeNull();
  });

  it.each([
    ["network", new BackendApiError(0, "network_unavailable", `raw network ${TOKEN}`)],
    ["server", new BackendApiError(500, "internal_error", `raw server ${TOKEN}`)],
    ["unknown", new Error(`raw unknown ${TOKEN}`)],
    ["malformed", null],
  ])("keeps %s recovery non-actionable until the server confirms it", async (_kind, error) => {
    loadPendingGiftCard.mockResolvedValue(pendingReservation("user-1"));
    const client = createClient();
    if (error) {
      client.getAdminGiftCard.mockRejectedValue(error);
    } else {
      client.getAdminGiftCard.mockResolvedValue({ card: null, events: [] });
    }
    const writer = {
      replaceHttpsUrl: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue(undefined),
    } as unknown as NfcUrlWriter;
    renderConsole(client, writer);

    await waitFor(() => expect(client.getAdminGiftCard).toHaveBeenCalledTimes(1));
    const capturedNfcRetry = screen.queryByText("Retry NFC write");
    if (capturedNfcRetry) fireEvent.press(capturedNfcRetry);
    const bootstrapRetry = screen.queryByText("Retry");
    if (bootstrapRetry) fireEvent.press(bootstrapRetry);
    await act(async () => Promise.resolve());

    expect(screen.getByText(
      "Unable to confirm the saved NFC reservation. Check the network and retry.",
    )).toBeTruthy();
    expect(screen.queryByText("Retry NFC write")).toBeNull();
    expect(writer.replaceHttpsUrl).not.toHaveBeenCalled();
    expect(client.reserveGiftCard).not.toHaveBeenCalled();
    expect(client.activateAdminGiftCard).not.toHaveBeenCalled();
    expect(clearPendingGiftCard).not.toHaveBeenCalled();
    expect(screen.queryByText(new RegExp(TOKEN, "u"))).toBeNull();
    expect(screen.queryByText(/raw (network|server|unknown)/u)).toBeNull();
  });

  it("reruns inventory and server confirmation before enabling a transient recovery", async () => {
    loadPendingGiftCard.mockResolvedValue(pendingReservation("user-1"));
    const client = createClient();
    client.getAdminGiftCard
      .mockRejectedValueOnce(new BackendApiError(0, "network_unavailable", "raw retry secret"))
      .mockResolvedValueOnce({ card: initializingCard, events: [] });
    const writer = {
      replaceHttpsUrl: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue(undefined),
    } as unknown as NfcUrlWriter;
    renderConsole(client, writer);

    const retry = await screen.findByText("Retry");
    expect(screen.queryByText("Retry NFC write")).toBeNull();
    expect(writer.replaceHttpsUrl).not.toHaveBeenCalled();
    fireEvent.press(retry);

    const nfcRetry = await screen.findByText("Retry NFC write");
    expect(client.listAdminGiftCards).toHaveBeenCalledTimes(2);
    expect(client.getAdminGiftCard).toHaveBeenCalledTimes(2);
    expect(writer.replaceHttpsUrl).not.toHaveBeenCalled();
    fireEvent.press(nfcRetry);

    await waitFor(() => expect(writer.replaceHttpsUrl).toHaveBeenCalledTimes(1));
    expect(client.activateAdminGiftCard).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/raw retry secret/u)).toBeNull();
  });

  it("rejects a mismatched initializing confirmation as malformed", async () => {
    loadPendingGiftCard.mockResolvedValue(pendingReservation("user-1"));
    const client = createClient();
    client.getAdminGiftCard.mockResolvedValue({
      card: { ...initializingCard, expiresAt: "2026-07-24T00:16:00.000Z" },
      events: [],
    });
    const writer = {
      replaceHttpsUrl: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue(undefined),
    } as unknown as NfcUrlWriter;
    renderConsole(client, writer);

    expect(await screen.findByText(
      "Unable to confirm the saved NFC reservation. Check the network and retry.",
    )).toBeTruthy();
    expect(screen.queryByText("Retry NFC write")).toBeNull();
    expect(writer.replaceHttpsUrl).not.toHaveBeenCalled();
    expect(client.activateAdminGiftCard).not.toHaveBeenCalled();
  });

  it("makes a captured retry handler inert immediately after sign-out", async () => {
    loadPendingGiftCard.mockResolvedValue(pendingReservation("user-1"));
    const client = createClient();
    client.getAdminGiftCard.mockResolvedValue({ card: initializingCard, events: [] });
    const writer = {
      replaceHttpsUrl: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue(undefined),
    } as unknown as NfcUrlWriter;
    currentAuth = { isAuthReady: true, session: oldSession };
    const view = renderConsole(client, writer);

    const retryText = await screen.findByText("Retry NFC write");
    const capturedRetry = closestPressable(retryText).props.onPress as () => void;
    expect(typeof capturedRetry).toBe("function");
    jest.clearAllMocks();
    currentAuth = { isAuthReady: true, session: null };
    view.rerender(consoleElement(client, writer));
    await waitFor(() => expect(screen.getByText(
      "Sign in with a developer allow-list email to continue.",
    )).toBeTruthy());

    await act(async () => {
      capturedRetry();
      await Promise.resolve();
    });
    expect(writer.replaceHttpsUrl).not.toHaveBeenCalled();
    expect(client.activateAdminGiftCard).not.toHaveBeenCalled();
    expect(client.reserveGiftCard).not.toHaveBeenCalled();
  });

  it("stops a deferred reservation chain after unmount", async () => {
    const reservation = deferred<ReturnType<typeof pendingReservation>>();
    const client = createClient();
    client.reserveGiftCard.mockReturnValue(reservation.promise);
    const writer = {
      replaceHttpsUrl: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue(undefined),
    } as unknown as NfcUrlWriter;
    currentAuth = { isAuthReady: true, session: oldSession };
    const view = renderConsole(client, writer);

    await screen.findByText("CARD-001");
    fireEvent.press(screen.getByText("Initialize current blank card"));
    await waitFor(() => expect(client.reserveGiftCard).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => reservation.resolve(pendingReservation("user-1")));

    expect(savePendingGiftCard).not.toHaveBeenCalled();
    expect(writer.replaceHttpsUrl).not.toHaveBeenCalled();
  });

  it("stops after an owner-scoped pending save finishes under a refreshed same-owner session", async () => {
    const saved = deferred<boolean>();
    savePendingGiftCard.mockReturnValueOnce(saved.promise);
    const client = createClient();
    const writer = {
      replaceHttpsUrl: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue(undefined),
    } as unknown as NfcUrlWriter;
    currentAuth = { isAuthReady: true, session: oldSession };
    const view = renderConsole(client, writer);

    await screen.findByText("CARD-001");
    jest.clearAllMocks();
    fireEvent.press(screen.getByText("Initialize current blank card"));
    await waitFor(() => expect(savePendingGiftCard).toHaveBeenCalledTimes(1));

    currentAuth = { isAuthReady: true, session: refreshedAdminSession };
    view.rerender(consoleElement(client, writer));
    await waitFor(() => expect(client.listAdminGiftCards).toHaveBeenCalledWith(
      refreshedAdminSession.accessToken,
      undefined,
    ));
    await act(async () => saved.resolve(true));

    expect(writer.replaceHttpsUrl).not.toHaveBeenCalled();
    expect(client.listAdminGiftCards).not.toHaveBeenCalledWith(
      oldSession.accessToken,
      undefined,
    );
  });

  it("cancels a pending NFC write on switch and never activates it with the old session", async () => {
    const physicalWrite = deferred<void>();
    loadPendingGiftCard.mockResolvedValue(pendingReservation("user-1"));
    const client = createClient();
    client.getAdminGiftCard.mockResolvedValue({ card: initializingCard, events: [] });
    const writer = {
      replaceHttpsUrl: jest.fn().mockReturnValue(physicalWrite.promise),
      cancel: jest.fn().mockResolvedValue(undefined),
    } as unknown as NfcUrlWriter;
    currentAuth = { isAuthReady: true, session: oldSession };
    const view = renderConsole(client, writer);

    await screen.findByText("Retry NFC write");
    jest.clearAllMocks();
    fireEvent.press(screen.getByText("Retry NFC write"));
    await waitFor(() => expect(writer.replaceHttpsUrl).toHaveBeenCalledTimes(1));

    currentAuth = { isAuthReady: true, session: null };
    view.rerender(consoleElement(client, writer));
    await waitFor(() => expect(writer.cancel).toHaveBeenCalled());
    await act(async () => physicalWrite.resolve());

    expect(client.activateAdminGiftCard).not.toHaveBeenCalled();
    expect(markPendingGiftCardWriteVerified).toHaveBeenCalledWith(
      oldSession.user.id,
      "card-2",
    );
  });

  it("does not clear or refresh an old activation after switching accounts", async () => {
    const activation = deferred<{ activated: boolean }>();
    const client = createClient();
    client.activateAdminGiftCard.mockReturnValue(activation.promise);
    const writer = {
      replaceHttpsUrl: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue(undefined),
    } as unknown as NfcUrlWriter;
    currentAuth = { isAuthReady: true, session: oldSession };
    const view = renderConsole(client, writer);

    await screen.findByText("CARD-001");
    fireEvent.press(screen.getByText("Initialize current blank card"));
    await waitFor(() => expect(client.activateAdminGiftCard).toHaveBeenCalledWith(
      oldSession.accessToken,
      "card-2",
    ));
    jest.clearAllMocks();

    currentAuth = { isAuthReady: true, session: newAdminSession };
    view.rerender(consoleElement(client, writer));
    await waitFor(() => expect(client.listAdminGiftCards).toHaveBeenCalledWith(
      newAdminSession.accessToken,
      undefined,
    ));
    await act(async () => activation.resolve({ activated: true }));

    expect(clearPendingGiftCard).not.toHaveBeenCalled();
    expect(client.listAdminGiftCards).not.toHaveBeenCalledWith(
      oldSession.accessToken,
      undefined,
    );
  });

  it("authorizes a new account without persisting or displaying its access token", async () => {
    const client = createClient();
    const writer = {
      replaceHttpsUrl: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue(undefined),
    } as unknown as NfcUrlWriter;
    currentAuth = { isAuthReady: true, session: oldSession };
    const view = renderConsole(client, writer);
    await screen.findByText("CARD-001");

    currentAuth = { isAuthReady: true, session: newAdminSession };
    view.rerender(consoleElement(client, writer));
    await waitFor(() => expect(client.listAdminGiftCards).toHaveBeenCalledWith(
      newAdminSession.accessToken,
      undefined,
    ));
    await waitFor(() => expect(loadPendingGiftCard).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(
      closestPressable(
        screen.getByText("Initialize current blank card"),
      ).props.disabled,
    ).toBe(false));
    fireEvent.press(screen.getByText("Initialize current blank card"));

    await waitFor(() => expect(savePendingGiftCard).toHaveBeenCalledWith(
      newAdminSession.user.id,
      expect.objectContaining({ ownerUserId: newAdminSession.user.id }),
    ));
    expect(JSON.stringify(savePendingGiftCard.mock.calls)).not.toContain(
      newAdminSession.accessToken,
    );
    expect(screen.queryByText(new RegExp(newAdminSession.accessToken, "u"))).toBeNull();
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
    await waitFor(() => expect(savePendingGiftCard).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ cardId: "card-2", ownerUserId: "user-1" }),
    ));
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
      ownerUserId: "user-1",
      operationId: "card-2",
      revision: 1,
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
